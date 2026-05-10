import { AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, modelForCredential, resolveAiCredential, resolveTaskAiPreset, type AiTextGenerator } from "./ai";
import {
  buildMaterialExtractionPrompt,
  createMaterialQuestionCandidates,
  listMaterialKnowledgeOptions,
  materialJobType,
  readMaterialText,
  validateExtractedQuestionsJson
} from "./materials";
import { prisma } from "./prisma";
import {
  processWrongNoteReviewCardJob,
  readPayloadWrongNoteId,
  wrongNoteReviewCardJobType,
  type AiImageGenerator
} from "./wrong-note-images";
import { buildPagination, type PaginationInput } from "./pagination";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type JobDatabase = typeof prisma;

const materialExtractionPromptVersion = "material-question-extract-v1";
const defaultMaxOutputTokens = 8192;
const defaultMaterialExtractionTimeoutMs = 20 * 60 * 1000;
const defaultMaterialExtractionJobStaleMs = 25 * 60 * 1000;
const defaultJobStaleMs = 15 * 60 * 1000;
const minJobStaleMs = 60 * 1000;
const noQueuedJobError = "暂无可处理任务。";
const claimChangedError = "任务已被其他执行者领取或状态已变化。";
const staleJobError = "任务运行超时，已自动重新排队。";

export type JobProcessorOptions = {
  db?: JobDatabase;
  env?: NodeJS.ProcessEnv;
  generateText?: AiTextGenerator;
  generateImage?: AiImageGenerator;
  now?: Date;
};

export type JobMaintenanceOptions = Pick<JobProcessorOptions, "db" | "env" | "now">;

export async function listJobs(filters: { status?: string | null } & PaginationInput = {}, db: JobDatabase = prisma) {
  const status = normalizeJobStatus(filters.status);
  const where = status ? { status } : {};
  const totalItems = await db.job.count({ where });
  const pagination = buildPagination(filters, totalItems);
  const jobs = await db.job.findMany({
    where,
    include: {
      user: true
    },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { runAt: "asc" }, { createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take
  });
  const materialIds = jobs.map((job) => readPayloadMaterialId(job.payload)).filter((id): id is string => Boolean(id));
  const wrongNoteIds = jobs.map((job) => readPayloadWrongNoteId(job.payload)).filter((id): id is string => Boolean(id));
  const materials = materialIds.length
    ? await db.material.findMany({
        where: {
          id: {
            in: materialIds
          }
        },
        select: {
          id: true,
          title: true
        }
      })
    : [];
  const wrongNotes = wrongNoteIds.length
    ? await db.wrongNote.findMany({
        where: {
          id: {
            in: wrongNoteIds
          }
        },
        include: {
          question: {
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 1
              }
            }
          }
        }
      })
    : [];
  const materialTitles = new Map(materials.map((material) => [material.id, material.title]));
  const wrongNoteTitles = new Map(wrongNotes.map((wrongNote) => [wrongNote.id, wrongNote.question.versions[0]?.stem ?? wrongNote.question.stem]));

  return {
    pagination,
    items: jobs.map((job) => {
    const materialId = readPayloadMaterialId(job.payload);
    const wrongNoteId = readPayloadWrongNoteId(job.payload);

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      priority: job.priority,
      progress: job.progress,
      payload: job.payload,
      error: job.error,
      result: job.result,
      userEmail: job.user?.email ?? null,
      materialId,
      materialTitle: materialId ? materialTitles.get(materialId) ?? null : null,
      wrongNoteId,
      wrongNoteTitle: wrongNoteId ? wrongNoteTitles.get(wrongNoteId) ?? null : null,
      runAt: job.runAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt
    };
  })
  };
}

export async function processNextJob(options: JobProcessorOptions = {}): Promise<ActionResult<{ jobId: string }>> {
  await recoverStaleJobs(options);

  const claimed = await claimNextJob(options);

  if (!claimed.ok) {
    return { ok: false, error: claimed.error };
  }

  return processClaimedJob(claimed.job, options);
}

export async function processJob(jobId: string, options: JobProcessorOptions = {}): Promise<ActionResult<{ jobId: string }>> {
  const claimed = await claimJobById(jobId, {
    ...options,
    allowedStatuses: ["queued", "failed"],
    unavailableError: "任务不存在或当前状态不可处理。"
  });

  if (!claimed.ok) {
    return { ok: false, error: claimed.error };
  }

  return processClaimedJob(claimed.job, options);
}

export async function retryJob(jobId: string, options: JobProcessorOptions = {}): Promise<ActionResult<{ jobId: string }>> {
  const claimed = await claimJobById(jobId, {
    ...options,
    allowedStatuses: ["failed"],
    unavailableError: "只能重试失败任务。"
  });

  if (!claimed.ok) {
    return { ok: false, error: claimed.error };
  }

  return processClaimedJob(claimed.job, options);
}

export async function recoverStaleJobs(options: JobMaintenanceOptions = {}): Promise<ActionResult<{ count: number }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const staleMs = resolveJobStaleMs(env);
  const materialStaleMs = resolveMaterialExtractionJobStaleMs(env);
  const regularCutoff = new Date(now.getTime() - staleMs);
  const materialCutoff = new Date(now.getTime() - materialStaleMs);
  const staleData = {
    status: "queued" as const,
    error: staleJobError,
    progress: 0,
    runAt: now,
    startedAt: null,
    finishedAt: null
  };
  const regularResult = await db.job.updateMany({
    where: {
      status: "running",
      type: {
        not: materialJobType
      },
      startedAt: {
        lte: regularCutoff
      }
    },
    data: staleData
  });
  const materialResult = await db.job.updateMany({
    where: {
      status: "running",
      type: materialJobType,
      startedAt: {
        lte: materialCutoff
      }
    },
    data: staleData
  });

  return { ok: true, data: { count: regularResult.count + materialResult.count } };
}

async function processClaimedJob(job: Prisma.JobGetPayload<object>, options: JobProcessorOptions): Promise<ActionResult<{ jobId: string }>> {
  const db = options.db ?? prisma;

  try {
    const result = await processJobByType(job, options);

    await db.job.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        progress: 100,
        result,
        error: null,
        finishedAt: new Date()
      }
    });

    return { ok: true, data: { jobId: job.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "任务处理失败。";

    await db.job.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: message,
        progress: 0,
        ...(error instanceof JobProcessingError && error.result ? { result: error.result } : {}),
        finishedAt: new Date()
      }
    });

    return { ok: false, error: message };
  }
}

async function claimNextJob(options: JobProcessorOptions): Promise<ClaimResult> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const job = await db.job.findFirst({
    where: {
      status: "queued",
      runAt: {
        lte: now
      }
    },
    orderBy: [{ priority: "asc" }, { runAt: "asc" }, { createdAt: "asc" }]
  });

  if (!job) {
    return { ok: false, error: noQueuedJobError };
  }

  return claimJobById(job.id, {
    ...options,
    now,
    allowedStatuses: ["queued"],
    requireDue: true,
    unavailableError: noQueuedJobError
  });
}

async function claimJobById(
  jobId: string,
  options: JobProcessorOptions & {
    allowedStatuses: Array<"queued" | "failed">;
    requireDue?: boolean;
    unavailableError: string;
  }
): Promise<ClaimResult> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const normalizedJobId = jobId.trim();

  if (!normalizedJobId) {
    return { ok: false, error: options.unavailableError };
  }

  const where: Prisma.JobWhereInput = {
    id: normalizedJobId,
    status: {
      in: options.allowedStatuses
    },
    ...(options.requireDue
      ? {
          runAt: {
            lte: now
          }
        }
      : {})
  };
  const job = await db.job.findFirst({ where });

  if (!job) {
    return { ok: false, error: options.unavailableError };
  }

  const claimed = await db.job.updateMany({
    where,
    data: {
      status: "running",
      error: null,
      progress: 10,
      startedAt: now,
      finishedAt: null
    }
  });

  if (claimed.count !== 1) {
    return { ok: false, error: claimChangedError };
  }

  const claimedJob = await db.job.findUnique({
    where: {
      id: job.id
    }
  });

  if (!claimedJob) {
    return { ok: false, error: claimChangedError };
  }

  return { ok: true, job: claimedJob };
}

async function processJobByType(job: Prisma.JobGetPayload<object>, options: JobProcessorOptions) {
  if (job.type === materialJobType) {
    return processMaterialExtractionJob(job.id, job.payload, options);
  }

  if (job.type === wrongNoteReviewCardJobType) {
    return processWrongNoteReviewCardJob(job.id, job.userId, job.payload, options);
  }

  throw new JobProcessingError("暂不支持该任务类型。");
}

async function processMaterialExtractionJob(jobId: string, payload: Prisma.JsonValue, options: JobProcessorOptions) {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const materialId = readPayloadMaterialId(payload);

  if (!materialId) {
    throw new JobProcessingError("任务缺少资料 ID。");
  }

  const materialText = await readMaterialText(materialId, db, env);

  if (!materialText.ok) {
    await markMaterialFailed(materialId, materialText.error, db);
    throw new JobProcessingError(materialText.error);
  }

  const { material, text, extractionMethod, ocrInput } = materialText.data;
  const presetResult = await resolveExtractionPreset(db, ocrInput?.type === "document" ? "document" : ocrInput ? "vision" : "json");

  if (!presetResult.ok) {
    await markMaterialFailed(material.id, presetResult.error, db);
    throw new JobProcessingError(presetResult.error);
  }

  const preset = presetResult.data;
  const credential = options.generateText ? null : await resolveAiCredential(material.ownerId, preset.provider, db, env);

  if (credential?.ok === false) {
    await markMaterialFailed(material.id, credential.error, db);
    throw new JobProcessingError(credential.error);
  }

  if (credential?.ok) {
    const usageAllowed = await assertAiUsageAllowed(material.ownerId, credential.data.source, db, env);

    if (!usageAllowed.ok) {
      await markMaterialFailed(material.id, usageAllowed.error, db);
      throw new JobProcessingError(usageAllowed.error);
    }
  }

  const knowledgeNodes = await listMaterialKnowledgeOptions(material.bindingScope, db);
  const prompt = buildMaterialExtractionPrompt({
    title: material.title,
    text: text || "资料正文来自随附图片或文档。请先读取随附内容，再按要求抽题。",
    knowledgeNodes: knowledgeNodes.map((node) => ({
      id: node.id,
      code: node.code ?? "",
      title: node.title
    }))
  });
  const input = ocrInput ? [{ type: "text" as const, text: prompt.input }, ocrInput] : prompt.input;
  const timeoutMs = resolveMaterialExtractionTimeoutMs(env);
  const model = modelForCredential(preset, credential);
  const aiCall = await db.aiCall.create({
    data: {
      userId: material.ownerId,
      provider: preset.provider,
      model,
      taskType: AiTaskType.extract_questions,
      promptVersion: materialExtractionPromptVersion,
      inputContextSource: `material:${material.id}`,
      tokenEstimate: Math.ceil(prompt.input.length / 4),
      imageCount: ocrInput ? 1 : null,
      credentialSource: credential?.ok ? credential.data.source : null,
      status: "running"
    }
  });

  try {
    const result = await (options.generateText ?? generateAiText)({
      provider: preset.provider,
      apiKey: credential?.ok ? credential.data.apiKey : "test-key",
      baseURL: credential?.ok ? credential.data.baseURL : null,
      apiMode: credential?.ok ? credential.data.apiMode : null,
      model,
      instructions: prompt.instructions,
      input,
      maxOutputTokens: preset.maxOutputTokens,
      temperature: preset.temperature,
      timeoutMs,
      maxRetries: 0
    });
    const parsed = validateExtractedQuestionsJson(result.text);

    if (!parsed.ok) {
      throw new JobProcessingError(parsed.error, {
        aiOutput: truncateText(result.text, 12000),
        error: parsed.error,
        model,
        promptVersion: materialExtractionPromptVersion
      });
    }

    await createMaterialQuestionCandidates(material.id, jobId, parsed.data.questions, db, { env });
    await db.$transaction([
      db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          status: "succeeded",
          usage: result.usage ?? undefined,
          errorSummary: null
        }
      }),
      db.material.update({
        where: { id: material.id },
        data: {
          extractionState: "succeeded",
          extractionMethod,
          extractionError: null
        }
      })
    ]);

    return {
      materialId: material.id,
      candidateCount: parsed.data.questions.length
    };
  } catch (error) {
    const message = formatMaterialExtractionError(error, preset.model, timeoutMs);
    const failureResult = error instanceof JobProcessingError ? error.result : undefined;

    await db.$transaction([
      db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          status: "failed",
          errorSummary: message.slice(0, 240)
        }
      }),
      db.material.update({
        where: { id: material.id },
        data: {
          extractionState: "failed",
          extractionMethod,
          extractionError: message.slice(0, 500)
        }
      })
    ]);

    throw new JobProcessingError(message, failureResult);
  }
}

async function resolveExtractionPreset(db: JobDatabase, requiredCapability: "json" | "vision" | "document" = "json") {
  return resolveTaskAiPreset(db, AiTaskType.extract_questions, requiredCapability, {
    defaultMaxOutputTokens,
    minMaxOutputTokens: defaultMaxOutputTokens
  });
}

async function markMaterialFailed(materialId: string, error: string, db: JobDatabase) {
  await db.material.update({
    where: { id: materialId },
    data: {
      extractionState: "failed",
      extractionError: error.slice(0, 500)
    }
  }).catch(() => undefined);
}

function readPayloadMaterialId(value: Prisma.JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.materialId === "string") {
    return value.materialId;
  }

  return null;
}

function normalizeJobStatus(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized || !["queued", "running", "succeeded", "failed", "canceled"].includes(normalized)) {
    return null;
  }

  return normalized as "queued" | "running" | "succeeded" | "failed" | "canceled";
}

class JobProcessingError extends Error {
  result?: Prisma.InputJsonValue;

  constructor(message: string, result?: Prisma.InputJsonValue) {
    super(message);
    this.name = "JobProcessingError";
    this.result = result;
  }
}

type ClaimResult = { ok: true; job: Prisma.JobGetPayload<object> } | { ok: false; error: string };

function resolveJobStaleMs(env: NodeJS.ProcessEnv) {
  const parsed = Number(env.OPENEXAM_JOB_STALE_MS);

  return Number.isFinite(parsed) && parsed >= minJobStaleMs ? Math.floor(parsed) : defaultJobStaleMs;
}

function resolveMaterialExtractionTimeoutMs(env: NodeJS.ProcessEnv) {
  const parsed = Number(env.OPENEXAM_MATERIAL_EXTRACT_TIMEOUT_MS);

  return Number.isFinite(parsed) && parsed >= minJobStaleMs ? Math.floor(parsed) : defaultMaterialExtractionTimeoutMs;
}

function resolveMaterialExtractionJobStaleMs(env: NodeJS.ProcessEnv) {
  const configured = Number(env.OPENEXAM_MATERIAL_EXTRACT_JOB_STALE_MS);
  const fallback = defaultMaterialExtractionJobStaleMs;
  const parsed = Number.isFinite(configured) && configured >= minJobStaleMs ? Math.floor(configured) : fallback;

  return Math.max(parsed, resolveMaterialExtractionTimeoutMs(env) + minJobStaleMs);
}

function formatMaterialExtractionError(error: unknown, model: string, timeoutMs: number) {
  if (isTimeoutError(error)) {
    return [
      `资料抽题请求超时：${model} 在 ${Math.round(timeoutMs / 1000)} 秒内未返回。`,
      "可调整 OPENEXAM_MATERIAL_EXTRACT_TIMEOUT_MS，或降低 OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS；同时确认网关 upstream/read timeout 不短于该值。"
    ].join("");
  }

  return error instanceof Error ? error.message : "AI 抽题失败。";
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars]` : value;
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  return name.includes("timeout") || message.includes("timed out") || message.includes("timeout");
}
