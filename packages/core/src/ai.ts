import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AiProvider, AiTaskType, Prisma } from "@prisma/client";
import OpenAI from "openai";
import { readSingleChoiceAnswerKey, readSingleChoiceOptions, type SingleChoiceOption } from "./practice";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type AiDatabase = typeof prisma;

export type AiTextRequest = {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number | null;
};

export type AiTextResponse = {
  text: string;
  usage?: Prisma.InputJsonValue | null;
};

export type AiTextGenerator = (request: AiTextRequest) => Promise<AiTextResponse>;

export type OpenAiCredentialResult =
  | {
      ok: true;
      data: {
        apiKey: string;
        source: "byok" | "platform";
      };
    }
  | { ok: false; error: string };

export type WrongNoteAiContext = {
  stem: string;
  options: SingleChoiceOption[];
  userAnswer: string;
  correctAnswer: string | null;
  officialExplanation: string | null;
  knowledgeNodes: string[];
  errorCount: number;
};

const openAiProvider = AiProvider.openai;
const wrongNoteTask = AiTaskType.explain_question;
const wrongNotePromptVersion = "wrong-note-explain-v1";
const defaultOpenAiModel = "gpt-5.5";
const defaultMaxOutputTokens = 700;

export function providerKeyHint(apiKey: string) {
  const normalized = apiKey.trim();
  const suffix = normalized.slice(-4);
  const prefix = normalized.slice(0, 3);

  return `${prefix || "key"}...${suffix}`;
}

export function resolveAiEncryptionSecret(env: NodeJS.ProcessEnv = process.env): ActionResult<{ secret: string }> {
  const configured = env.AI_KEY_ENCRYPTION_SECRET?.trim();

  if (configured) {
    return { ok: true, data: { secret: configured } };
  }

  if (env.NODE_ENV === "production") {
    return { ok: false, error: "AI_KEY_ENCRYPTION_SECRET 未配置，无法保存 API Key。" };
  }

  return {
    ok: true,
    data: {
      secret: env.SESSION_SECRET?.trim() || "openexam-local-ai-key-secret"
    }
  };
}

export function encryptAiSecret(plaintext: string, env: NodeJS.ProcessEnv = process.env): ActionResult<{ encrypted: string }> {
  const secret = resolveAiEncryptionSecret(env);

  if (!secret.ok) {
    return secret;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(secret.data.secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ok: true,
    data: {
      encrypted: ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":")
    }
  };
}

export function decryptAiSecret(encryptedValue: string, env: NodeJS.ProcessEnv = process.env): ActionResult<{ plaintext: string }> {
  const secret = resolveAiEncryptionSecret(env);

  if (!secret.ok) {
    return secret;
  }

  const [version, ivText, tagText, encryptedText] = encryptedValue.split(":");

  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    return { ok: false, error: "API Key 密文格式无效，请重新保存。" };
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(secret.data.secret), Buffer.from(ivText, "base64"));

    decipher.setAuthTag(Buffer.from(tagText, "base64"));

    const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8");

    return { ok: true, data: { plaintext } };
  } catch {
    return { ok: false, error: "API Key 解密失败，请重新保存。" };
  }
}

export async function getUserAiSettings(userId: string, db: AiDatabase = prisma, env: NodeJS.ProcessEnv = process.env) {
  const openAiKey = await db.userProviderKey.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: openAiProvider
      }
    }
  });

  return {
    providers: [
      {
        provider: openAiProvider,
        label: "OpenAI",
        configured: Boolean(openAiKey),
        keyHint: openAiKey?.keyHint ?? null,
        updatedAt: openAiKey?.updatedAt ?? null,
        platformAvailable: Boolean(env.OPENAI_API_KEY?.trim())
      }
    ]
  };
}

export async function saveUserProviderKey(
  userId: string,
  input: { provider: string; apiKey: string },
  db: AiDatabase = prisma,
  env: NodeJS.ProcessEnv = process.env
): Promise<ActionResult> {
  const provider = input.provider.trim();
  const apiKey = input.apiKey.trim();

  if (provider !== openAiProvider) {
    return { ok: false, error: "首版仅支持 OpenAI。" };
  }

  if (apiKey.length < 8) {
    return { ok: false, error: "请输入有效的 OpenAI API Key。" };
  }

  const encrypted = encryptAiSecret(apiKey, env);

  if (!encrypted.ok) {
    return encrypted;
  }

  await db.userProviderKey.upsert({
    where: {
      userId_provider: {
        userId,
        provider: openAiProvider
      }
    },
    update: {
      encryptedKey: encrypted.data.encrypted,
      keyHint: providerKeyHint(apiKey)
    },
    create: {
      userId,
      provider: openAiProvider,
      encryptedKey: encrypted.data.encrypted,
      keyHint: providerKeyHint(apiKey)
    }
  });

  return { ok: true };
}

export async function deleteUserProviderKey(userId: string, provider: string, db: AiDatabase = prisma): Promise<ActionResult> {
  if (provider.trim() !== openAiProvider) {
    return { ok: false, error: "首版仅支持 OpenAI。" };
  }

  await db.userProviderKey.deleteMany({
    where: {
      userId,
      provider: openAiProvider
    }
  });

  return { ok: true };
}

export async function resolveOpenAiCredential(userId: string, db: AiDatabase = prisma, env: NodeJS.ProcessEnv = process.env): Promise<OpenAiCredentialResult> {
  const savedKey = await db.userProviderKey.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: openAiProvider
      }
    }
  });

  if (savedKey) {
    const decrypted = decryptAiSecret(savedKey.encryptedKey, env);

    if (!decrypted.ok) {
      return decrypted;
    }

    return {
      ok: true,
      data: {
        apiKey: decrypted.data.plaintext,
        source: "byok" as const
      }
    };
  }

  const platformKey = env.OPENAI_API_KEY?.trim();

  if (platformKey) {
    return {
      ok: true,
      data: {
        apiKey: platformKey,
        source: "platform" as const
      }
    };
  }

  return { ok: false, error: "请先在个人设置中配置 OpenAI API Key。" } as const;
}

export async function listUserAiCalls(userId: string, db: AiDatabase = prisma) {
  const calls = await db.aiCall.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: 30
  });

  return calls.map((call) => ({
    id: call.id,
    provider: call.provider,
    model: call.model,
    taskType: call.taskType,
    promptVersion: call.promptVersion,
    inputContextSource: call.inputContextSource,
    status: call.status,
    errorSummary: call.errorSummary,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt
  }));
}

export async function generateWrongNoteAiAnalysis(
  userId: string,
  wrongNoteId: string,
  options: {
    db?: AiDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ analysis: string; aiCallId: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const preset = await resolveWrongNotePreset(db);
  const wrongNote = await loadWrongNoteContext(userId, wrongNoteId, db);

  if (!wrongNote) {
    return { ok: false, error: "错题不存在。" };
  }

  const context = toWrongNoteAiContext(wrongNote);
  const prompt = buildWrongNotePrompt(context);
  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: openAiProvider,
      model: preset.model,
      taskType: wrongNoteTask,
      promptVersion: wrongNotePromptVersion,
      inputContextSource: `wrong_note:${wrongNote.id}`,
      tokenEstimate: estimateTokens(prompt.input),
      status: "running"
    }
  });

  try {
    const fakeText = readFakeAiResponse(env);
    let result: AiTextResponse;

    if (fakeText) {
      result = { text: fakeText, usage: { fake: true } };
    } else {
      const credential = options.generateText ? null : await resolveOpenAiCredential(userId, db, env);

      if (credential?.ok === false) {
        const error = credential.error;

        await markAiCallFailed(aiCall.id, error, db);
        return { ok: false, error };
      }

      result = await (options.generateText ?? generateOpenAiText)({
        apiKey: credential?.ok ? credential.data.apiKey : "test-key",
        model: preset.model,
        instructions: prompt.instructions,
        input: prompt.input,
        maxOutputTokens: preset.maxOutputTokens
      });
    }

    const analysis = result.text.trim();

    if (!analysis) {
      throw new Error("AI 没有返回解析内容。");
    }

    await db.$transaction([
      db.wrongNote.update({
        where: { id: wrongNote.id },
        data: {
          aiAnalysis: analysis
        }
      }),
      db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          status: "succeeded",
          usage: result.usage ?? undefined,
          errorSummary: null
        }
      })
    ]);

    return { ok: true, data: { analysis, aiCallId: aiCall.id } };
  } catch (error) {
    const message = formatAiError(error);

    await markAiCallFailed(aiCall.id, message, db);

    return { ok: false, error: message };
  }
}

export function buildWrongNotePrompt(context: WrongNoteAiContext) {
  const options = context.options.map((option) => `${option.key}. ${option.text}`).join("\n") || "无选项";

  return {
    instructions:
      "你是 OpenExam 的错题讲解助手。只根据给定题目上下文作答，不要编造题目以外的信息。用简体中文，语气直接，给出可执行的复习建议。",
    input: [
      "请为这道错题生成一段学习解析，包含：",
      "1. 为什么正确答案成立。",
      "2. 学员答案可能错在哪里。",
      "3. 对应知识点的复习提醒。",
      "",
      `题干：${context.stem}`,
      `选项：\n${options}`,
      `学员答案：${context.userAnswer || "未记录"}`,
      `正确答案：${context.correctAnswer ?? "未配置"}`,
      `官方解析：${context.officialExplanation || "暂无"}`,
      `知识点：${context.knowledgeNodes.join(" / ") || "未绑定知识点"}`,
      `累计错误次数：${context.errorCount}`,
      "",
      "输出 3-5 个短段落，不要使用 Markdown 表格。"
    ].join("\n")
  };
}

export async function generateOpenAiText(request: AiTextRequest): Promise<AiTextResponse> {
  const client = new OpenAI({
    apiKey: request.apiKey
  });
  const response = await client.responses.create({
    model: request.model,
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: request.maxOutputTokens ?? defaultMaxOutputTokens
  });

  return {
    text: response.output_text ?? "",
    usage: toJsonValue(response.usage)
  };
}

async function resolveWrongNotePreset(db: AiDatabase) {
  const preset = await db.aiProviderPreset.findFirst({
    where: {
      provider: openAiProvider,
      defaultForTask: wrongNoteTask,
      enabled: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    model: preset?.model ?? defaultOpenAiModel,
    maxOutputTokens: preset?.maxTokens ?? defaultMaxOutputTokens
  };
}

async function loadWrongNoteContext(userId: string, wrongNoteId: string, db: AiDatabase) {
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

function toWrongNoteAiContext(wrongNote: NonNullable<Awaited<ReturnType<typeof loadWrongNoteContext>>>): WrongNoteAiContext {
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

async function markAiCallFailed(aiCallId: string, errorSummary: string, db: AiDatabase) {
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

function deriveEncryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function readFakeAiResponse(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === "production") {
    return null;
  }

  return env.OPENEXAM_FAKE_AI_RESPONSE?.trim() || null;
}

function formatAiError(error: unknown) {
  const message = error instanceof Error ? error.message : "AI 解析生成失败。";

  return redactSecret(message).slice(0, 240) || "AI 解析生成失败。";
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
