import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AiProvider, AiTaskType, Prisma } from "@prisma/client";
import OpenAI from "openai";
import { formatAnswerValue, readObjectiveAnswerKey, readSingleChoiceOptions, type SingleChoiceOption } from "./practice";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type AiDatabase = typeof prisma;

export type AiTextRequest = {
  provider?: AiProvider;
  apiKey: string;
  baseURL?: string | null;
  model: string;
  instructions: string;
  input: string | AiTextInputPart[];
  maxOutputTokens?: number | null;
  temperature?: number | null;
};

export type AiTextInputPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image" | "document";
      mimeType: string;
      dataBase64: string;
      filename?: string | null;
    };

export type AiTextResponse = {
  text: string;
  usage?: Prisma.InputJsonValue | null;
};

export type AiTextGenerator = (request: AiTextRequest) => Promise<AiTextResponse>;

export type AiCredentialResult =
  | {
      ok: true;
      data: {
        apiKey: string;
        baseURL: string | null;
        source: "byok" | "platform";
      };
    }
  | { ok: false; error: string };

export type OpenAiCredentialResult = AiCredentialResult;

export type WrongNoteAiContext = {
  stem: string;
  options: SingleChoiceOption[];
  userAnswer: string;
  correctAnswer: string | null;
  officialExplanation: string | null;
  knowledgeNodes: string[];
  mistakeTags?: string[];
  userNotes?: string | null;
  errorCount: number;
};

export type AttemptAnswerAiContext = {
  kind: string;
  stem: string;
  options: SingleChoiceOption[];
  userAnswer: string;
  correctAnswer: string | null;
  officialExplanation: string | null;
  knowledgeNodes: string[];
};

export type AiProviderPresetInput = {
  id?: string;
  provider: string;
  model: string;
  label: string;
  capabilities?: string | string[] | null;
  defaultForTask?: string | null;
  temperature?: string | number | null;
  maxTokens?: string | number | null;
  enabled?: string | boolean | null;
};

const openAiProvider = AiProvider.openai;
const supportedAiProviders = [AiProvider.openai, AiProvider.anthropic, AiProvider.gemini] as const;
const wrongNoteTask = AiTaskType.explain_question;
const wrongNotePromptVersion = "wrong-note-explain-v1";
const questionPromptVersion = "question-explain-v1";
const defaultOpenAiModel = "gpt-5.5";
const defaultAnthropicModel = "claude-sonnet-4-5-20250929";
const defaultGeminiModel = "gemini-2.5-flash";
const defaultMaxOutputTokens = 700;
const defaultDailyAiCallLimit = 50;
const defaultDailyPlatformTokenLimit = 100000;
const providerLabels: Record<AiProvider, string> = {
  [AiProvider.openai]: "OpenAI",
  [AiProvider.anthropic]: "Claude",
  [AiProvider.gemini]: "Gemini"
};
const platformKeyEnv: Record<AiProvider, string> = {
  [AiProvider.openai]: "OPENAI_API_KEY",
  [AiProvider.anthropic]: "ANTHROPIC_API_KEY",
  [AiProvider.gemini]: "GEMINI_API_KEY"
};
const platformBaseUrlEnv: Record<AiProvider, string> = {
  [AiProvider.openai]: "OPENAI_BASE_URL",
  [AiProvider.anthropic]: "ANTHROPIC_BASE_URL",
  [AiProvider.gemini]: "GEMINI_BASE_URL"
};
const taskCapabilityRequirements: Record<AiTaskType, string> = {
  [AiTaskType.explain_question]: "text",
  [AiTaskType.grade_subjective]: "text",
  [AiTaskType.generate_plan]: "json",
  [AiTaskType.extract_questions]: "json",
  [AiTaskType.generate_practice_questions]: "json",
  [AiTaskType.diagnose_learning]: "json",
  [AiTaskType.generate_wrong_note_image_prompt]: "text",
  [AiTaskType.generate_image]: "image",
  [AiTaskType.chat_with_context]: "text"
};

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
  const keys = await db.userProviderKey.findMany({
    where: {
      userId,
      provider: {
        in: [...supportedAiProviders]
      }
    }
  });
  const keyByProvider = new Map(keys.map((key) => [key.provider, key]));

  return {
    providers: supportedAiProviders.map((provider) => {
      const key = keyByProvider.get(provider);

      return {
        provider,
        label: providerLabels[provider],
        configured: Boolean(key),
        keyHint: key?.keyHint ?? null,
        updatedAt: key?.updatedAt ?? null,
        platformAvailable: Boolean(env[platformKeyEnv[provider]]?.trim())
      };
    })
  };
}

export async function saveUserProviderKey(
  userId: string,
  input: { provider: string; apiKey: string },
  db: AiDatabase = prisma,
  env: NodeJS.ProcessEnv = process.env
): Promise<ActionResult> {
  const provider = parseAiProvider(input.provider);
  const apiKey = input.apiKey.trim();

  if (!provider) {
    return { ok: false, error: "请选择有效的 AI Provider。" };
  }

  if (apiKey.length < 8) {
    return { ok: false, error: `请输入有效的 ${providerLabels[provider]} API Key。` };
  }

  const encrypted = encryptAiSecret(apiKey, env);

  if (!encrypted.ok) {
    return encrypted;
  }

  await db.userProviderKey.upsert({
    where: {
      userId_provider: {
        userId,
        provider
      }
    },
    update: {
      encryptedKey: encrypted.data.encrypted,
      keyHint: providerKeyHint(apiKey)
    },
    create: {
      userId,
      provider,
      encryptedKey: encrypted.data.encrypted,
      keyHint: providerKeyHint(apiKey)
    }
  });

  return { ok: true };
}

export async function deleteUserProviderKey(userId: string, provider: string, db: AiDatabase = prisma): Promise<ActionResult> {
  const parsedProvider = parseAiProvider(provider);

  if (!parsedProvider) {
    return { ok: false, error: "请选择有效的 AI Provider。" };
  }

  await db.userProviderKey.deleteMany({
    where: {
      userId,
      provider: parsedProvider
    }
  });

  return { ok: true };
}

export async function resolveOpenAiCredential(userId: string, db: AiDatabase = prisma, env: NodeJS.ProcessEnv = process.env): Promise<OpenAiCredentialResult> {
  return resolveAiCredential(userId, openAiProvider, db, env);
}

export async function resolveAiCredential(userId: string, provider: AiProvider, db: AiDatabase = prisma, env: NodeJS.ProcessEnv = process.env): Promise<AiCredentialResult> {
  const savedKey = await db.userProviderKey.findUnique({
    where: {
      userId_provider: {
        userId,
        provider
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
        baseURL: normalizeBaseUrl(env[platformBaseUrlEnv[provider]]),
        source: "byok" as const
      }
    };
  }

  const platformKey = env[platformKeyEnv[provider]]?.trim();

  if (platformKey) {
    return {
      ok: true,
      data: {
        apiKey: platformKey,
        baseURL: normalizeBaseUrl(env[platformBaseUrlEnv[provider]]),
        source: "platform" as const
      }
    };
  }

  return { ok: false, error: `请先在个人设置中配置 ${providerLabels[provider]} API Key。` } as const;
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
    credentialSource: call.credentialSource,
    usage: call.usage,
    durationMs: call.updatedAt.getTime() - call.createdAt.getTime(),
    errorSummary: call.errorSummary,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt
  }));
}

export async function assertAiUsageAllowed(
  userId: string,
  credentialSource: "byok" | "platform",
  db: AiDatabase = prisma,
  env: NodeJS.ProcessEnv = process.env
): Promise<ActionResult> {
  const dayStart = startOfLocalDay(new Date());
  const dailyLimit = parsePositiveInteger(env.OPENEXAM_DAILY_AI_CALL_LIMIT, defaultDailyAiCallLimit);
  const userCallCount = await db.aiCall.count({
    where: {
      userId,
      createdAt: {
        gte: dayStart
      },
      status: {
        not: "canceled"
      }
    }
  });

  if (userCallCount >= dailyLimit) {
    return { ok: false, error: `今日 AI 调用次数已达到上限 ${dailyLimit} 次。` };
  }

  if (credentialSource !== "platform") {
    return { ok: true };
  }

  const platformLimit = parsePositiveInteger(env.OPENEXAM_DAILY_PLATFORM_TOKEN_LIMIT, defaultDailyPlatformTokenLimit);
  const calls = await db.aiCall.findMany({
    where: {
      credentialSource: "platform",
      createdAt: {
        gte: dayStart
      },
      status: "succeeded"
    },
    select: {
      usage: true
    }
  });
  const usedTokens = calls.reduce((sum, call) => sum + readTotalTokens(call.usage), 0);

  if (usedTokens >= platformLimit) {
    return { ok: false, error: `平台 Key 今日 Token 预算已达到上限 ${platformLimit}。` };
  }

  return { ok: true };
}

export async function getAiUsageOverview(db: AiDatabase = prisma) {
  const dayStart = startOfLocalDay(new Date());
  const calls = await db.aiCall.findMany({
    where: {
      createdAt: {
        gte: dayStart
      }
    },
    select: {
      status: true,
      credentialSource: true,
      usage: true
    }
  });

  return {
    todayCalls: calls.length,
    todayFailures: calls.filter((call) => call.status === "failed").length,
    platformCalls: calls.filter((call) => call.credentialSource === "platform").length,
    platformTokens: calls.filter((call) => call.credentialSource === "platform").reduce((sum, call) => sum + readTotalTokens(call.usage), 0)
  };
}

export async function listAdminAiProviderPresets(db: AiDatabase = prisma) {
  return db.aiProviderPreset.findMany({
    orderBy: [{ provider: "asc" }, { enabled: "desc" }, { updatedAt: "desc" }]
  });
}

export async function upsertAiProviderPreset(input: AiProviderPresetInput, db: AiDatabase = prisma): Promise<ActionResult> {
  const parsed = parseAiProviderPresetInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    if (input.id?.trim()) {
      await db.aiProviderPreset.update({
        where: { id: input.id.trim() },
        data: parsed.data
      });
    } else {
      await db.aiProviderPreset.upsert({
        where: {
          provider_model: {
            provider: parsed.data.provider,
            model: parsed.data.model
          }
        },
        update: parsed.data,
        create: parsed.data
      });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatPresetWriteError(error) };
  }
}

export async function setAiProviderPresetEnabled(id: string, enabled: boolean, db: AiDatabase = prisma): Promise<ActionResult> {
  const presetId = id.trim();

  if (!presetId) {
    return { ok: false, error: "模型预设不存在。" };
  }

  try {
    await db.aiProviderPreset.update({
      where: { id: presetId },
      data: { enabled }
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "模型预设不存在。" };
  }
}

export async function retryFailedAiCall(
  userId: string,
  aiCallId: string,
  options: {
    db?: AiDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ analysis: string; aiCallId: string; retryOfAiCallId: string }>> {
  const db = options.db ?? prisma;
  const failedCall = await db.aiCall.findFirst({
    where: {
      id: aiCallId,
      userId,
      status: "failed",
      taskType: wrongNoteTask
    }
  });

  if (!failedCall) {
    return { ok: false, error: "只能重试当前账号下失败的题目解析任务。" };
  }

  const wrongNoteId = parseWrongNoteSource(failedCall.inputContextSource);
  const attemptAnswerId = parseAttemptAnswerSource(failedCall.inputContextSource);

  if (!wrongNoteId && !attemptAnswerId) {
    return { ok: false, error: "这条 AI 任务缺少可重试的题目来源。" };
  }

  const result = wrongNoteId
    ? await generateWrongNoteAiAnalysis(userId, wrongNoteId, options)
    : await generateAttemptAnswerAiExplanation(userId, attemptAnswerId!, options);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      ...result.data,
      retryOfAiCallId: failedCall.id
    }
  };
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
      provider: preset.provider,
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
      const credential = options.generateText ? null : await resolveAiCredential(userId, preset.provider, db, env);

      if (credential?.ok === false) {
        const error = credential.error;

        await markAiCallFailed(aiCall.id, error, db);
        return { ok: false, error };
      }

      if (credential?.ok) {
        const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

        if (!usageAllowed.ok) {
          await markAiCallFailed(aiCall.id, usageAllowed.error, db);
          return usageAllowed;
        }

        await db.aiCall.update({
          where: { id: aiCall.id },
          data: {
            credentialSource: credential.data.source
          }
        });
      }

      result = await (options.generateText ?? generateAiText)({
        provider: preset.provider,
        apiKey: credential?.ok ? credential.data.apiKey : "test-key",
        baseURL: credential?.ok ? credential.data.baseURL : normalizeBaseUrl(env[platformBaseUrlEnv[preset.provider]]),
        model: preset.model,
        instructions: prompt.instructions,
        input: prompt.input,
        maxOutputTokens: preset.maxOutputTokens,
        temperature: preset.temperature
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

export async function generateAttemptAnswerAiExplanation(
  userId: string,
  attemptAnswerId: string,
  options: {
    db?: AiDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ analysis: string; aiCallId: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const preset = await resolveWrongNotePreset(db);
  const answer = await loadAttemptAnswerContext(userId, attemptAnswerId, db);

  if (!answer) {
    return { ok: false, error: "作答记录不存在。" };
  }

  const context = toAttemptAnswerAiContext(answer);
  const prompt = buildQuestionExplanationPrompt(context);
  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model: preset.model,
      taskType: wrongNoteTask,
      promptVersion: questionPromptVersion,
      inputContextSource: `attempt_answer:${answer.id}`,
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
      const credential = options.generateText ? null : await resolveAiCredential(userId, preset.provider, db, env);

      if (credential?.ok === false) {
        const error = credential.error;

        await markAiCallFailed(aiCall.id, error, db);
        return { ok: false, error };
      }

      if (credential?.ok) {
        const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

        if (!usageAllowed.ok) {
          await markAiCallFailed(aiCall.id, usageAllowed.error, db);
          return usageAllowed;
        }

        await db.aiCall.update({
          where: { id: aiCall.id },
          data: {
            credentialSource: credential.data.source
          }
        });
      }

      result = await (options.generateText ?? generateAiText)({
        provider: preset.provider,
        apiKey: credential?.ok ? credential.data.apiKey : "test-key",
        baseURL: credential?.ok ? credential.data.baseURL : normalizeBaseUrl(env[platformBaseUrlEnv[preset.provider]]),
        model: preset.model,
        instructions: prompt.instructions,
        input: prompt.input,
        maxOutputTokens: preset.maxOutputTokens,
        temperature: preset.temperature
      });
    }

    const analysis = result.text.trim();

    if (!analysis) {
      throw new Error("AI 没有返回解析内容。");
    }

    await db.$transaction([
      db.attemptAnswer.update({
        where: { id: answer.id },
        data: {
          aiExplanation: analysis
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

export async function generateQuestionExplanation(
  userId: string,
  questionId: string,
  options: {
    db?: AiDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ analysis: string; aiCallId: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const preset = await resolveWrongNotePreset(db);
  const question = await db.question.findFirst({
    where: { id: questionId.trim() },
    include: {
      knowledgeBindings: {
        include: { knowledgeNode: true }
      },
      versions: {
        orderBy: { version: "desc" },
        take: 1
      }
    }
  });

  if (!question) {
    return { ok: false, error: "题目不存在。" };
  }

  const version = question.versions[0] ?? null;
  const payload = version?.payload ?? question.payload;
  const answerKey = version?.answerKey ?? question.answerKey;
  const stem = version?.stem ?? question.stem;
  const optionsList = readSingleChoiceOptions(payload) ?? [];
  const correctAnswer = formatAnswerValue(readObjectiveAnswerKey(answerKey));
  const knowledgeNodes = question.knowledgeBindings.map((b) => b.knowledgeNode.title);
  const explanation = version?.explanation ?? question.explanation;

  const promptText = [
    "请为这道题生成一段独立学习解析，包含：",
    "1. 题目考查点。",
    "2. 推荐解题步骤。",
    "3. 易错避坑提醒。",
    "",
    `题型：${question.kind}`,
    `题干：${stem}`,
    `选项：${optionsList.map((o) => `${o.key}. ${o.text}`).join("\n") || "无选项"}`,
    `参考答案：${correctAnswer ?? "未配置"}`,
    `官方解析：${explanation || "暂无"}`,
    `知识点：${knowledgeNodes.join(" / ") || "未绑定知识点"}`,
    "",
    "输出 3-5 个短段落，不要使用 Markdown 表格。"
  ].join("\n");

  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model: preset.model,
      taskType: wrongNoteTask,
      promptVersion: questionPromptVersion,
      inputContextSource: `question:${question.id}`,
      tokenEstimate: estimateTokens(promptText),
      status: "running"
    }
  });

  try {
    const fakeText = readFakeAiResponse(env);
    let result: AiTextResponse;

    if (fakeText) {
      result = { text: fakeText, usage: { fake: true } };
    } else {
      const credential = options.generateText ? null : await resolveAiCredential(userId, preset.provider, db, env);

      if (credential?.ok === false) {
        const error = credential.error;
        await markAiCallFailed(aiCall.id, error, db);
        return { ok: false, error };
      }

      if (credential?.ok) {
        const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

        if (!usageAllowed.ok) {
          await markAiCallFailed(aiCall.id, usageAllowed.error, db);
          return usageAllowed;
        }

        await db.aiCall.update({
          where: { id: aiCall.id },
          data: { credentialSource: credential.data.source }
        });
      }

      result = await (options.generateText ?? generateAiText)({
        provider: preset.provider,
        apiKey: credential?.ok ? credential.data.apiKey : "test-key",
        baseURL: credential?.ok ? credential.data.baseURL : normalizeBaseUrl(env[platformBaseUrlEnv[preset.provider]]),
        model: preset.model,
        instructions: "你是 OpenExam 的题目讲解助手。只根据给定题目上下文作答，不要编造题目以外的信息。用简体中文，直接解释解题思路和关键知识点。",
        input: promptText,
        maxOutputTokens: preset.maxOutputTokens,
        temperature: preset.temperature
      });
    }

    const analysis = result.text.trim();

    if (!analysis) {
      throw new Error("AI 没有返回解析内容。");
    }

    await db.aiCall.update({
      where: { id: aiCall.id },
      data: {
        status: "succeeded",
        usage: result.usage ?? undefined,
        errorSummary: null
      }
    });

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
      `用户标签：${context.mistakeTags?.join(" / ") || "暂无"}`,
      `用户笔记：${context.userNotes || "暂无"}`,
      `累计错误次数：${context.errorCount}`,
      "",
      "输出 3-5 个短段落，不要使用 Markdown 表格。"
    ].join("\n")
  };
}

export function buildQuestionExplanationPrompt(context: AttemptAnswerAiContext) {
  const options = context.options.map((option) => `${option.key}. ${option.text}`).join("\n") || "无选项";

  return {
    instructions:
      "你是 OpenExam 的题目讲解助手。只根据给定题目上下文作答，不要编造题目以外的信息。用简体中文，直接解释解题思路和关键知识点。",
    input: [
      "请为这道题生成一段独立学习解析，包含：",
      "1. 题目考查点。",
      "2. 推荐解题步骤。",
      "3. 学员答案与参考答案的差异。",
      "",
      `题型：${context.kind}`,
      `题干：${context.stem}`,
      `选项：\n${options}`,
      `学员答案：${context.userAnswer || "未记录"}`,
      `参考答案：${context.correctAnswer ?? "未配置"}`,
      `官方解析：${context.officialExplanation || "暂无"}`,
      `知识点：${context.knowledgeNodes.join(" / ") || "未绑定知识点"}`,
      "",
      "输出 3-5 个短段落，不要使用 Markdown 表格。"
    ].join("\n")
  };
}

export async function generateAiText(request: AiTextRequest): Promise<AiTextResponse> {
  const provider = request.provider ?? openAiProvider;

  if (provider === AiProvider.anthropic) {
    return generateAnthropicText(request);
  }

  if (provider === AiProvider.gemini) {
    return generateGeminiText(request);
  }

  return generateOpenAiText(request);
}

export async function generateOpenAiText(request: AiTextRequest): Promise<AiTextResponse> {
  const client = new OpenAI({
    apiKey: request.apiKey,
    baseURL: request.baseURL || undefined
  });
  const response = await client.responses.create({
    model: request.model,
    instructions: request.instructions,
    input: toOpenAiResponseInput(request.input),
    max_output_tokens: request.maxOutputTokens ?? defaultMaxOutputTokens,
    temperature: request.temperature ?? undefined
  });

  return {
    text: response.output_text ?? "",
    usage: toJsonValue(response.usage)
  };
}

export async function generateAnthropicText(request: AiTextRequest): Promise<AiTextResponse> {
  const response = await fetch(`${request.baseURL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxOutputTokens ?? defaultMaxOutputTokens,
      temperature: request.temperature ?? undefined,
      system: request.instructions,
      messages: [
        {
          role: "user",
          content: toAnthropicContent(request.input)
        }
      ]
    })
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readProviderError(body, `Anthropic 请求失败 (${response.status})。`));
  }

  return {
    text: readAnthropicText(body),
    usage: toJsonValue(body?.usage)
  };
}

export async function generateGeminiText(request: AiTextRequest): Promise<AiTextResponse> {
  const baseUrl = (request.baseURL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const model = request.model.startsWith("models/") ? request.model : `models/${request.model}`;
  const response = await fetch(`${baseUrl}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": request.apiKey
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: request.instructions }]
      },
      contents: [
        {
          role: "user",
          parts: toGeminiParts(request.input)
        }
      ],
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens ?? defaultMaxOutputTokens,
        temperature: request.temperature ?? undefined
      }
    })
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readProviderError(body, `Gemini 请求失败 (${response.status})。`));
  }

  return {
    text: readGeminiText(body),
    usage: toJsonValue(body?.usageMetadata)
  };
}

async function resolveWrongNotePreset(db: AiDatabase) {
  const preset = await db.aiProviderPreset.findFirst({
    where: {
      defaultForTask: wrongNoteTask,
      enabled: true,
      capabilities: {
        has: taskCapabilityRequirements[wrongNoteTask]
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    provider: preset?.provider ?? openAiProvider,
    model: preset?.model ?? defaultOpenAiModel,
    maxOutputTokens: preset?.maxTokens ?? defaultMaxOutputTokens,
    temperature: preset?.temperature ?? null
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

async function loadAttemptAnswerContext(userId: string, attemptAnswerId: string, db: AiDatabase) {
  return db.attemptAnswer.findFirst({
    where: {
      id: attemptAnswerId.trim(),
      attempt: {
        userId
      }
    },
    include: {
      questionVersion: true,
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
    correctAnswer: formatAnswerValue(readObjectiveAnswerKey(answerKey)),
    officialExplanation: version?.explanation ?? wrongNote.question.explanation,
    knowledgeNodes: wrongNote.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title),
    mistakeTags: wrongNote.mistakeTags,
    userNotes: wrongNote.userNotes,
    errorCount: wrongNote.errorCount
  };
}

function toAttemptAnswerAiContext(answer: NonNullable<Awaited<ReturnType<typeof loadAttemptAnswerContext>>>): AttemptAnswerAiContext {
  const version = answer.questionVersion ?? answer.question.versions[0] ?? null;
  const payload = version?.payload ?? answer.question.payload;
  const answerKey = version?.answerKey ?? answer.question.answerKey;

  return {
    kind: answer.question.kind,
    stem: version?.stem ?? answer.question.stem,
    options: readSingleChoiceOptions(payload) ?? [],
    userAnswer: readSubmittedAnswer(answer.userAnswer),
    correctAnswer: formatAnswerValue(readObjectiveAnswerKey(answerKey)),
    officialExplanation: version?.explanation ?? answer.question.explanation,
    knowledgeNodes: answer.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
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

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readTotalTokens(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  const usage = value as Record<string, unknown>;
  const total = usage.total_tokens ?? usage.totalTokens ?? usage.totalTokenCount;

  if (typeof total === "number" && Number.isFinite(total)) {
    return total;
  }

  const input = usage.input_tokens ?? usage.inputTokens ?? usage.promptTokenCount;
  const output = usage.output_tokens ?? usage.outputTokens ?? usage.candidatesTokenCount;

  return numberValue(input) + numberValue(output);
}

function readFakeAiResponse(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === "production") {
    return null;
  }

  return env.OPENEXAM_FAKE_AI_RESPONSE?.trim() || null;
}

function normalizeOpenAiBaseUrl(value: string | null | undefined) {
  return normalizeBaseUrl(value);
}

function normalizeBaseUrl(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized || null;
}

function parseAiProvider(value: string | null | undefined) {
  const normalized = value?.trim();

  return supportedAiProviders.includes(normalized as AiProvider) ? (normalized as AiProvider) : null;
}

function parseCapabilities(value: string | string[] | null | undefined, provider: AiProvider | null): ActionResult<string[]> {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split(",");
  const capabilities = [...new Set(rawValues.map((item) => item.trim()).filter(Boolean))];

  if (capabilities.length === 0) {
    return { ok: true, data: defaultCapabilities(provider) };
  }

  const allowed = new Set(["text", "json", "vision", "document", "image"]);
  const invalid = capabilities.find((capability) => !allowed.has(capability));

  if (invalid) {
    return { ok: false, error: "模型 capability 参数无效。" };
  }

  return { ok: true, data: capabilities };
}

function defaultCapabilities(provider: AiProvider | null) {
  if (provider === AiProvider.openai) {
    return ["text", "json", "vision", "document", "image"];
  }

  if (provider === AiProvider.anthropic || provider === AiProvider.gemini) {
    return ["text", "json", "vision", "document"];
  }

  return ["text", "json"];
}

function parseAiProviderPresetInput(input: AiProviderPresetInput): ActionResult<{
  provider: AiProvider;
  model: string;
  label: string;
  capabilities: string[];
  defaultForTask: AiTaskType | null;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
}> {
  const provider = parseAiProvider(input.provider);
  const model = input.model.trim();
  const label = input.label.trim() || model;
  const defaultForTask = parseAiTaskType(input.defaultForTask);
  const temperature = parseOptionalNumber(input.temperature, "temperature");
  const maxTokens = parseOptionalInteger(input.maxTokens, "max tokens");
  const capabilities = parseCapabilities(input.capabilities, provider);

  if (!provider) {
    return { ok: false, error: "请选择有效的 AI Provider。" };
  }

  if (!model) {
    return { ok: false, error: "请输入模型名称。" };
  }

  if (!capabilities.ok) {
    return capabilities;
  }

  if (!temperature.ok) {
    return temperature;
  }

  if (!maxTokens.ok) {
    return maxTokens;
  }

  if (temperature.data !== null && (temperature.data < 0 || temperature.data > 2)) {
    return { ok: false, error: "temperature 必须在 0 到 2 之间。" };
  }

  if (maxTokens.data !== null && maxTokens.data < 1) {
    return { ok: false, error: "max tokens 必须大于 0。" };
  }

  if (defaultForTask && !capabilities.data.includes(taskCapabilityRequirements[defaultForTask])) {
    return { ok: false, error: "模型 capability 不满足默认任务路由要求。" };
  }

  return {
    ok: true,
    data: {
      provider,
      model,
      label,
      capabilities: capabilities.data,
      defaultForTask,
      temperature: temperature.data,
      maxTokens: maxTokens.data,
      enabled: parseBoolean(input.enabled)
    }
  };
}

function parseAiTaskType(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return Object.values(AiTaskType).includes(normalized as AiTaskType) ? (normalized as AiTaskType) : null;
}

function parseOptionalNumber(value: string | number | null | undefined, label: string): ActionResult<number | null> {
  const normalized = typeof value === "number" ? String(value) : value?.trim();

  if (!normalized) {
    return { ok: true, data: null };
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `${label} 必须是数字。` };
  }

  return { ok: true, data: parsed };
}

function parseOptionalInteger(value: string | number | null | undefined, label: string): ActionResult<number | null> {
  const parsed = parseOptionalNumber(value, label);

  if (!parsed.ok || parsed.data === null) {
    return parsed;
  }

  if (!Number.isInteger(parsed.data)) {
    return { ok: false, error: `${label} 必须是整数。` };
  }

  return parsed;
}

function parseBoolean(value: string | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  return value === "true" || value === "on" || value === "1";
}

function parseWrongNoteSource(value: string | null) {
  const prefix = "wrong_note:";

  if (!value?.startsWith(prefix)) {
    return null;
  }

  return value.slice(prefix.length).trim() || null;
}

function parseAttemptAnswerSource(value: string | null) {
  const prefix = "attempt_answer:";

  if (!value?.startsWith(prefix)) {
    return null;
  }

  return value.slice(prefix.length).trim() || null;
}

function formatPresetWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return "模型预设不存在。";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "同一 provider 下模型名称不能重复。";
  }

  return "模型预设保存失败。";
}

function formatAiError(error: unknown) {
  const message = error instanceof Error ? error.message : "AI 解析生成失败。";

  return redactSecret(message).slice(0, 240) || "AI 解析生成失败。";
}

function redactSecret(value: string) {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}

function toOpenAiResponseInput(input: AiTextRequest["input"]) {
  if (typeof input === "string") {
    return input;
  }

  return [
    {
      role: "user",
      content: input.map((part) => {
        if (part.type === "text") {
          return {
            type: "input_text",
            text: part.text
          };
        }

        if (part.type === "image") {
          return {
            type: "input_image",
            image_url: `data:${part.mimeType};base64,${part.dataBase64}`
          };
        }

        return {
          type: "input_file",
          filename: part.filename || "document",
          file_data: `data:${part.mimeType};base64,${part.dataBase64}`
        };
      })
    }
  ] as never;
}

function toAnthropicContent(input: AiTextRequest["input"]) {
  const parts = typeof input === "string" ? [{ type: "text" as const, text: input }] : input;

  return parts.map((part) => {
    if (part.type === "text") {
      return {
        type: "text",
        text: part.text
      };
    }

    return {
      type: part.type,
      source: {
        type: "base64",
        media_type: part.mimeType,
        data: part.dataBase64
      }
    };
  });
}

function toGeminiParts(input: AiTextRequest["input"]) {
  const parts = typeof input === "string" ? [{ type: "text" as const, text: input }] : input;

  return parts.map((part) => {
    if (part.type === "text") {
      return { text: part.text };
    }

    return {
      inline_data: {
        mime_type: part.mimeType,
        data: part.dataBase64
      }
    };
  });
}

function readAnthropicText(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const content = (value as { content?: unknown }).content;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function readGeminiText(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const candidates = (value as { candidates?: unknown }).candidates;

  if (!Array.isArray(candidates)) {
    return "";
  }

  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return [];
      }

      const content = (candidate as { content?: { parts?: unknown } }).content;

      return Array.isArray(content?.parts) ? content.parts : [];
    })
    .map((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function readProviderError(value: unknown, fallback: string) {
  if (value && typeof value === "object") {
    const error = (value as { error?: unknown }).error;

    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      return error.message;
    }

    if ("message" in value && typeof value.message === "string") {
      return value.message;
    }
  }

  return fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
