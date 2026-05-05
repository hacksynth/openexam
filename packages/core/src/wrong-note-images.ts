import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AiProvider, AiTaskType, Prisma, Visibility } from "@prisma/client";
import OpenAI from "openai";
import { assertAiUsageAllowed, resolveOpenAiCredential } from "./ai";
import { readSingleChoiceAnswerKey, readSingleChoiceOptions, type SingleChoiceOption } from "./practice";
import { prisma } from "./prisma";
import { resolveLocalStoragePath } from "./storage";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type WrongNoteImageDatabase = typeof prisma;

export type WrongNoteReviewCardContext = {
  stem: string;
  options: SingleChoiceOption[];
  userAnswer: string;
  correctAnswer: string | null;
  officialExplanation: string | null;
  knowledgeNodes: string[];
  errorCount: number;
};

export type AiImageRequest = {
  apiKey: string;
  baseURL?: string | null;
  model: string;
  prompt: string;
  userId: string;
};

export type AiImageResponse = {
  bytes: Buffer;
  mimeType: "image/png";
  usage?: Prisma.InputJsonValue | null;
};

export type AiImageGenerator = (request: AiImageRequest) => Promise<AiImageResponse>;

export type WrongNoteReviewCardProcessorOptions = {
  db?: WrongNoteImageDatabase;
  env?: NodeJS.ProcessEnv;
  generateImage?: AiImageGenerator;
};

export const wrongNoteReviewCardJobType = "generate_wrong_note_review_card";

const reviewCardPromptVersion = "wrong-note-review-card-v1";
const defaultImageModel = "gpt-image-1.5";

export async function queueWrongNoteReviewCard(
  userId: string,
  wrongNoteId: string,
  db: WrongNoteImageDatabase = prisma
): Promise<ActionResult<{ jobId: string }>> {
  const normalizedWrongNoteId = wrongNoteId.trim();

  if (!normalizedWrongNoteId) {
    return { ok: false, error: "错题不存在。" };
  }

  const wrongNote = await db.wrongNote.findFirst({
    where: {
      id: normalizedWrongNoteId,
      userId
    },
    select: {
      id: true
    }
  });

  if (!wrongNote) {
    return { ok: false, error: "错题不存在。" };
  }

  const job = await db.job.create({
    data: {
      type: wrongNoteReviewCardJobType,
      userId,
      payload: {
        wrongNoteId: wrongNote.id
      },
      progress: 0
    }
  });

  return { ok: true, data: { jobId: job.id } };
}

export async function listWrongNoteReviewCardViews(userId: string, wrongNoteIds: string[], db: WrongNoteImageDatabase = prisma) {
  const requestedIds = [...new Set(wrongNoteIds.map((id) => id.trim()).filter(Boolean))];

  if (requestedIds.length === 0) {
    return new Map<string, WrongNoteReviewCardView>();
  }

  const requestedSet = new Set(requestedIds);
  const jobs = await db.job.findMany({
    where: {
      userId,
      type: wrongNoteReviewCardJobType,
      createdAt: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60)
      }
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300
  });
  const latestJobByWrongNote = new Map<string, WrongNoteReviewCardView["latestJob"]>();
  const assetIdByWrongNote = new Map<string, string>();

  for (const job of jobs) {
    const wrongNoteId = readPayloadWrongNoteId(job.payload);

    if (!wrongNoteId || !requestedSet.has(wrongNoteId)) {
      continue;
    }

    if (!latestJobByWrongNote.has(wrongNoteId)) {
      latestJobByWrongNote.set(wrongNoteId, {
        id: job.id,
        status: job.status,
        progress: job.progress,
        error: job.error,
        updatedAt: job.updatedAt
      });
    }

    if (job.status === "succeeded" && !assetIdByWrongNote.has(wrongNoteId)) {
      const assetId = readResultAssetId(job.result);

      if (assetId) {
        assetIdByWrongNote.set(wrongNoteId, assetId);
      }
    }
  }

  const assets = assetIdByWrongNote.size
    ? await db.asset.findMany({
        where: {
          id: {
            in: [...assetIdByWrongNote.values()]
          },
          ownerId: userId
        },
        select: {
          id: true,
          mimeType: true,
          createdAt: true
        }
      })
    : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const views = new Map<string, WrongNoteReviewCardView>();

  for (const wrongNoteId of requestedIds) {
    const assetId = assetIdByWrongNote.get(wrongNoteId);

    views.set(wrongNoteId, {
      latestJob: latestJobByWrongNote.get(wrongNoteId) ?? null,
      asset: assetId ? assetById.get(assetId) ?? null : null
    });
  }

  return views;
}

export async function processWrongNoteReviewCardJob(
  jobId: string,
  userId: string | null,
  payload: Prisma.JsonValue,
  options: WrongNoteReviewCardProcessorOptions = {}
) {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const wrongNoteId = readPayloadWrongNoteId(payload);

  if (!userId) {
    throw new Error("任务缺少用户 ID。");
  }

  if (!wrongNoteId) {
    throw new Error("任务缺少错题 ID。");
  }

  const wrongNote = await loadWrongNoteImageContext(userId, wrongNoteId, db);

  if (!wrongNote) {
    throw new Error("错题不存在。");
  }

  const context = toWrongNoteReviewCardContext(wrongNote);
  const prompt = buildWrongNoteReviewCardPrompt(context);
  const preset = await resolveImagePreset(db);
  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: AiProvider.openai,
      model: preset.model,
      taskType: AiTaskType.generate_image,
      promptVersion: reviewCardPromptVersion,
      inputContextSource: `wrong_note:${wrongNote.id}`,
      tokenEstimate: estimateTokens(prompt),
      imageCount: 1,
      status: "running"
    }
  });

  try {
    const credential = options.generateImage ? null : await resolveOpenAiCredential(userId, db, env);

    if (credential?.ok === false) {
      await markAiCallFailed(aiCall.id, credential.error, db);
      throw new Error(credential.error);
    }

    if (credential?.ok) {
      const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

      if (!usageAllowed.ok) {
        await markAiCallFailed(aiCall.id, usageAllowed.error, db);
        throw new Error(usageAllowed.error);
      }

      await db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          credentialSource: credential.data.source
        }
      });
    }

    const image = await (options.generateImage ?? generateOpenAiImage)({
      apiKey: credential?.ok ? credential.data.apiKey : "test-key",
      baseURL: credential?.ok ? credential.data.baseURL : normalizeOpenAiBaseUrl(env.OPENAI_BASE_URL),
      model: preset.model,
      prompt,
      userId
    });
    const stored = await storeReviewCardImage(userId, image.bytes, image.mimeType, env);
    const asset = await db.asset.create({
      data: {
        ownerId: userId,
        visibility: Visibility.private,
        mimeType: image.mimeType,
        sizeBytes: image.bytes.length,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        source: "wrong_note_review_card"
      },
      select: {
        id: true
      }
    });

    await db.aiCall.update({
      where: { id: aiCall.id },
      data: {
        status: "succeeded",
        usage: image.usage ?? undefined,
        errorSummary: null
      }
    });

    return {
      wrongNoteId: wrongNote.id,
      assetId: asset.id
    };
  } catch (error) {
    const message = formatImageError(error);

    await markAiCallFailed(aiCall.id, message, db);

    throw new Error(message);
  }
}

export function buildWrongNoteReviewCardPrompt(context: WrongNoteReviewCardContext) {
  const options = context.options.map((option) => `${option.key}. ${option.text}`).join("\n") || "无选项";

  return [
    "Create a vertical PNG study review card for a Chinese exam learner.",
    "Use crisp, readable Simplified Chinese text, strong contrast, clean grid layout, and no decorative clutter.",
    "The card should contain these sections: 题目, 我的答案, 正确答案, 关键解析, 知识点, 复习提醒.",
    "Keep text concise and preserve the factual content exactly. Do not add URLs, QR codes, provider names, API keys, or watermarks.",
    "",
    `题目：${context.stem}`,
    `选项：\n${options}`,
    `我的答案：${context.userAnswer || "未记录"}`,
    `正确答案：${context.correctAnswer ?? "未配置"}`,
    `解析：${context.officialExplanation || "暂无"}`,
    `知识点：${context.knowledgeNodes.join(" / ") || "未绑定知识点"}`,
    `累计错误次数：${context.errorCount}`
  ].join("\n");
}

export async function generateOpenAiImage(request: AiImageRequest): Promise<AiImageResponse> {
  const client = new OpenAI({
    apiKey: request.apiKey,
    baseURL: request.baseURL || undefined
  });
  const gptImageModel = isGptImageModel(request.model);
  const response = await client.images.generate(
    gptImageModel
      ? {
          model: request.model,
          prompt: request.prompt,
          n: 1,
          size: "1024x1536",
          quality: "medium",
          output_format: "png",
          user: request.userId
        }
      : {
          model: request.model,
          prompt: request.prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
          user: request.userId
        }
  );
  const b64Json = response.data?.[0]?.b64_json?.trim();

  if (!b64Json) {
    throw new Error("OpenAI 没有返回图片数据。");
  }

  const bytes = Buffer.from(b64Json, "base64");

  if (bytes.length === 0) {
    throw new Error("OpenAI 返回的图片数据为空。");
  }

  return {
    bytes,
    mimeType: "image/png",
    usage: toJsonValue(response.usage)
  };
}

export function readPayloadWrongNoteId(value: Prisma.JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.wrongNoteId === "string") {
    return value.wrongNoteId;
  }

  return null;
}

function readResultAssetId(value: Prisma.JsonValue | null | undefined) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.assetId === "string") {
    return value.assetId;
  }

  return null;
}

async function resolveImagePreset(db: WrongNoteImageDatabase) {
  const preset = await db.aiProviderPreset.findFirst({
    where: {
      provider: AiProvider.openai,
      defaultForTask: AiTaskType.generate_image,
      enabled: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    model: preset?.model ?? defaultImageModel
  };
}

async function loadWrongNoteImageContext(userId: string, wrongNoteId: string, db: WrongNoteImageDatabase) {
  return db.wrongNote.findFirst({
    where: {
      id: wrongNoteId,
      userId
    },
    include: {
      attemptAnswer: {
        include: {
          questionVersion: true
        }
      },
      question: {
        include: {
          knowledgeBindings: {
            include: {
              knowledgeNode: true
            }
          },
          versions: {
            orderBy: { version: "desc" },
            take: 1
          }
        }
      }
    }
  });
}

function toWrongNoteReviewCardContext(wrongNote: NonNullable<Awaited<ReturnType<typeof loadWrongNoteImageContext>>>): WrongNoteReviewCardContext {
  const version = wrongNote.attemptAnswer?.questionVersion ?? wrongNote.question.versions[0] ?? null;
  const payload = version?.payload ?? wrongNote.question.payload;
  const answerKey = version?.answerKey ?? wrongNote.question.answerKey;

  return {
    stem: version?.stem ?? wrongNote.question.stem,
    options: readSingleChoiceOptions(payload) ?? [],
    userAnswer: readSubmittedAnswer(wrongNote.attemptAnswer?.userAnswer),
    correctAnswer: readSingleChoiceAnswerKey(answerKey),
    officialExplanation: version?.explanation ?? wrongNote.question.explanation,
    knowledgeNodes: wrongNote.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title),
    errorCount: wrongNote.errorCount
  };
}

async function storeReviewCardImage(userId: string, bytes: Buffer, mimeType: "image/png", env: NodeJS.ProcessEnv) {
  const extension = mimeType === "image/png" ? "png" : "bin";
  const storageKey = `review-cards/${userId}/${randomUUID()}.${extension}`;
  const storagePath = resolveLocalStoragePath(storageKey, env);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, bytes);

  return {
    storageKey,
    sha256
  };
}

async function markAiCallFailed(aiCallId: string, errorSummary: string, db: WrongNoteImageDatabase) {
  await db.aiCall.update({
    where: { id: aiCallId },
    data: {
      status: "failed",
      errorSummary
    }
  });
}

function readSubmittedAnswer(value: Prisma.JsonValue | null | undefined) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.value === "string") {
    return value.value;
  }

  return "";
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function isGptImageModel(model: string) {
  return model.startsWith("gpt-image") || model === "chatgpt-image-latest";
}

function normalizeOpenAiBaseUrl(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized || null;
}

function formatImageError(error: unknown) {
  const message = error instanceof Error ? error.message : "错题复习卡图片生成失败。";

  return redactSecret(message).slice(0, 240) || "错题复习卡图片生成失败。";
}

function redactSecret(value: string) {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export type WrongNoteReviewCardView = {
  latestJob: {
    id: string;
    status: string;
    progress: number;
    error: string | null;
    updatedAt: Date;
  } | null;
  asset: {
    id: string;
    mimeType: string;
    createdAt: Date;
  } | null;
};
