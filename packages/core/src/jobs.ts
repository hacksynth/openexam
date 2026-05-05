import { AiProvider, AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, resolveAiCredential, type AiTextGenerator } from "./ai";
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

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type JobDatabase = typeof prisma;

const materialExtractionPromptVersion = "material-question-extract-v1";
const defaultOpenAiModel = "gpt-5.5";
const defaultExtractionProvider = AiProvider.openai;
const defaultMaxOutputTokens = 1400;
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

export async function listJobs(filters: { status?: string | null } = {}, db: JobDatabase = prisma) {
  const status = normalizeJobStatus(filters.status);
  const jobs = await db.job.findMany({
    where: status ? { status } : {},
    include: {
      user: true
    },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { runAt: "asc" }, { createdAt: "desc" }],
    take: 100
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

  return jobs.map((job) => {
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
  });
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
  const cutoff = new Date(now.getTime() - staleMs);
  const result = await db.job.updateMany({
    where: {
      status: "running",
      startedAt: {
        lte: cutoff
      }
    },
    data: {
      status: "queued",
      error: staleJobError,
      progress: 0,
      runAt: now,
      startedAt: null,
      finishedAt: null
    }
  });

  return { ok: true, data: { count: result.count } };
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

  const materialText = await readMaterialText(materialId, db);

  if (!materialText.ok) {
    await markMaterialFailed(materialId, materialText.error, db);
    throw new JobProcessingError(materialText.error);
  }

  const { material, text, extractionMethod, ocrInput } = materialText.data;
  const preset = await resolveExtractionPreset(db, ocrInput?.type === "document" ? "document" : ocrInput ? "vision" : "json");
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
  const aiCall = await db.aiCall.create({
    data: {
      userId: material.ownerId,
      provider: preset.provider,
      model: preset.model,
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
      model: preset.model,
      instructions: prompt.instructions,
      input,
      maxOutputTokens: preset.maxOutputTokens,
      temperature: preset.temperature
    });
    const parsed = validateExtractedQuestionsJson(result.text);

    if (!parsed.ok) {
      throw new JobProcessingError(parsed.error);
    }

    await createMaterialQuestionCandidates(material.id, jobId, parsed.data.questions, db);
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
    const message = error instanceof Error ? error.message : "AI 抽题失败。";

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

    throw new JobProcessingError(message);
  }
}

async function resolveExtractionPreset(db: JobDatabase, requiredCapability: "json" | "vision" | "document" = "json") {
  const preset = await db.aiProviderPreset.findFirst({
    where: {
      defaultForTask: AiTaskType.extract_questions,
      enabled: true,
      capabilities: {
        has: requiredCapability
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    provider: preset?.provider ?? defaultExtractionProvider,
    model: preset?.model ?? defaultOpenAiModel,
    maxOutputTokens: preset?.maxTokens ?? defaultMaxOutputTokens,
    temperature: preset?.temperature ?? null
  };
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

class JobProcessingError extends Error {}

type ClaimResult = { ok: true; job: Prisma.JobGetPayload<object> } | { ok: false; error: string };

function resolveJobStaleMs(env: NodeJS.ProcessEnv) {
  const parsed = Number(env.OPENEXAM_JOB_STALE_MS);

  return Number.isFinite(parsed) && parsed >= minJobStaleMs ? Math.floor(parsed) : defaultJobStaleMs;
}
