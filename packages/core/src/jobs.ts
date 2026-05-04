import { AiProvider, AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateOpenAiText, resolveOpenAiCredential, type AiTextGenerator } from "./ai";
import {
  buildMaterialExtractionPrompt,
  createMaterialQuestionCandidates,
  listMaterialKnowledgeOptions,
  materialJobType,
  readMaterialText,
  validateExtractedQuestionsJson
} from "./materials";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type JobDatabase = typeof prisma;

const materialExtractionPromptVersion = "material-question-extract-v1";
const defaultOpenAiModel = "gpt-5.5";
const defaultMaxOutputTokens = 1400;

export type JobProcessorOptions = {
  db?: JobDatabase;
  env?: NodeJS.ProcessEnv;
  generateText?: AiTextGenerator;
};

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
  const materialTitles = new Map(materials.map((material) => [material.id, material.title]));

  return jobs.map((job) => {
    const materialId = readPayloadMaterialId(job.payload);

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      priority: job.priority,
      progress: job.progress,
      error: job.error,
      result: job.result,
      userEmail: job.user?.email ?? null,
      materialId,
      materialTitle: materialId ? materialTitles.get(materialId) ?? null : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt
    };
  });
}

export async function processNextJob(options: JobProcessorOptions = {}): Promise<ActionResult<{ jobId: string }>> {
  const db = options.db ?? prisma;
  const job = await db.job.findFirst({
    where: {
      status: "queued",
      runAt: {
        lte: new Date()
      }
    },
    orderBy: [{ priority: "asc" }, { runAt: "asc" }, { createdAt: "asc" }]
  });

  if (!job) {
    return { ok: false, error: "暂无可处理任务。" };
  }

  const result = await processJob(job.id, options);

  if (!result.ok) {
    return result;
  }

  return { ok: true, data: { jobId: job.id } };
}

export async function processJob(jobId: string, options: JobProcessorOptions = {}): Promise<ActionResult<{ jobId: string }>> {
  const db = options.db ?? prisma;
  const job = await db.job.findFirst({
    where: {
      id: jobId,
      status: {
        in: ["queued", "failed"]
      }
    }
  });

  if (!job) {
    return { ok: false, error: "任务不存在或当前状态不可处理。" };
  }

  await db.job.update({
    where: { id: job.id },
    data: {
      status: "running",
      error: null,
      progress: 10,
      startedAt: new Date(),
      finishedAt: null
    }
  });

  try {
    if (job.type !== materialJobType) {
      throw new JobProcessingError("暂不支持该任务类型。");
    }

    const result = await processMaterialExtractionJob(job.id, job.payload, options);

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

export async function retryJob(jobId: string, options: JobProcessorOptions = {}): Promise<ActionResult<{ jobId: string }>> {
  const db = options.db ?? prisma;
  const job = await db.job.findFirst({
    where: {
      id: jobId,
      status: "failed"
    }
  });

  if (!job) {
    return { ok: false, error: "只能重试失败任务。" };
  }

  await db.job.update({
    where: { id: job.id },
    data: {
      status: "queued",
      error: null,
      progress: 0,
      runAt: new Date(),
      startedAt: null,
      finishedAt: null
    }
  });

  return processJob(job.id, options);
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

  const { material, text } = materialText.data;
  const credential = options.generateText ? null : await resolveOpenAiCredential(material.ownerId, db, env);

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

  const preset = await resolveExtractionPreset(db);
  const knowledgeNodes = await listMaterialKnowledgeOptions(material.bindingScope, db);
  const prompt = buildMaterialExtractionPrompt({
    title: material.title,
    text,
    knowledgeNodes: knowledgeNodes.map((node) => ({
      id: node.id,
      code: node.code ?? "",
      title: node.title
    }))
  });
  const aiCall = await db.aiCall.create({
    data: {
      userId: material.ownerId,
      provider: AiProvider.openai,
      model: preset.model,
      taskType: AiTaskType.extract_questions,
      promptVersion: materialExtractionPromptVersion,
      inputContextSource: `material:${material.id}`,
      tokenEstimate: Math.ceil(prompt.input.length / 4),
      credentialSource: credential?.ok ? credential.data.source : "byok",
      status: "running"
    }
  });

  try {
    const result = await (options.generateText ?? generateOpenAiText)({
      apiKey: credential?.ok ? credential.data.apiKey : "test-key",
      baseURL: credential?.ok ? credential.data.baseURL : env.OPENAI_BASE_URL?.trim() || null,
      model: preset.model,
      instructions: prompt.instructions,
      input: prompt.input,
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
          extractionState: "succeeded"
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
          extractionState: "failed"
        }
      })
    ]);

    throw new JobProcessingError(message);
  }
}

async function resolveExtractionPreset(db: JobDatabase) {
  const preset = await db.aiProviderPreset.findFirst({
    where: {
      provider: AiProvider.openai,
      defaultForTask: AiTaskType.extract_questions,
      enabled: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    model: preset?.model ?? defaultOpenAiModel,
    maxOutputTokens: preset?.maxTokens ?? defaultMaxOutputTokens,
    temperature: preset?.temperature ?? null
  };
}

async function markMaterialFailed(materialId: string, error: string, db: JobDatabase) {
  await db.material.update({
    where: { id: materialId },
    data: {
      extractionState: "failed"
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
