import { describe, expect, it } from "vitest";
import {
  buildWrongNotePrompt,
  decryptAiSecret,
  encryptAiSecret,
  generateAttemptAnswerAiExplanation,
  generateQuestionExplanation,
  assertAiUsageAllowed,
  generateWrongNoteAiAnalysis,
  getUserAiSettings,
  retryFailedAiCall,
  upsertAiProviderPreset,
  providerKeyHint,
  resolveAiEncryptionSecret,
  resolveOpenAiCredential
} from "@openexam/core/ai";

describe("AI key encryption", () => {
  it("encrypts and decrypts provider keys without exposing plaintext", () => {
    const env = { AI_KEY_ENCRYPTION_SECRET: "test-secret" };
    const encrypted = encryptAiSecret("sk-test-secret-value", env);

    expect(encrypted.ok).toBe(true);
    expect(encrypted.ok ? encrypted.data.encrypted : "").not.toContain("sk-test-secret-value");
    expect(encrypted.ok ? decryptAiSecret(encrypted.data.encrypted, env) : null).toEqual({
      ok: true,
      data: {
        plaintext: "sk-test-secret-value"
      }
    });
    expect(encrypted.ok ? decryptAiSecret(encrypted.data.encrypted, { AI_KEY_ENCRYPTION_SECRET: "wrong" }) : null).toEqual({
      ok: false,
      error: "API Key 解密失败，请重新保存。"
    });
  });

  it("requires an explicit encryption secret in production", () => {
    expect(resolveAiEncryptionSecret({ NODE_ENV: "production" })).toEqual({
      ok: false,
      error: "AI_KEY_ENCRYPTION_SECRET 未配置，无法保存 API Key。"
    });
  });

  it("only exposes a short key hint", () => {
    expect(providerKeyHint("sk-openexam-abcdef")).toBe("sk-...cdef");
  });
});

describe("OpenAI credential resolution", () => {
  it("prefers BYOK over platform keys", async () => {
    const env = {
      AI_KEY_ENCRYPTION_SECRET: "test-secret",
      OPENAI_API_KEY: "sk-platform-key"
    };
    const encrypted = encryptAiSecret("sk-user-key", env);
    const db = {
      userProviderKey: {
        findUnique: async () => ({
          encryptedKey: encrypted.ok ? encrypted.data.encrypted : "",
          keyHint: "sk-...-key"
        })
      }
    };

    await expect(resolveOpenAiCredential("user_1", db as never, env)).resolves.toEqual({
      ok: true,
      data: {
        apiKey: "sk-user-key",
        baseURL: null,
        source: "byok"
      }
    });
  });

  it("falls back to the platform key and fails clearly when no key exists", async () => {
    const db = {
      userProviderKey: {
        findUnique: async () => null
      }
    };

    await expect(resolveOpenAiCredential("user_1", db as never, { OPENAI_API_KEY: "sk-platform-key" })).resolves.toEqual({
      ok: true,
      data: {
        apiKey: "sk-platform-key",
        baseURL: null,
        source: "platform"
      }
    });
    await expect(resolveOpenAiCredential("user_1", db as never, {})).resolves.toEqual({
      ok: false,
      error: "请先在个人设置中配置 OpenAI API Key。"
    });
  });

  it("passes configured OpenAI-compatible base URLs with credentials", async () => {
    const db = {
      userProviderKey: {
        findUnique: async () => null
      }
    };

    await expect(
      resolveOpenAiCredential("user_1", db as never, {
        OPENAI_API_KEY: "sk-platform-key",
        OPENAI_BASE_URL: "http://127.0.0.1:8317/v1"
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        apiKey: "sk-platform-key",
        baseURL: "http://127.0.0.1:8317/v1",
        source: "platform"
      }
    });
  });
});

describe("AI provider settings", () => {
  it("returns OpenAI, Claude, and Gemini BYOK settings for the profile page", async () => {
    const db = {
      userProviderKey: {
        findMany: async () => [
          {
            provider: "anthropic",
            keyHint: "sk-...ude",
            updatedAt: new Date("2026-05-05T00:00:00.000Z")
          }
        ]
      }
    };

    await expect(
      getUserAiSettings("user_1", db as never, {
        OPENAI_API_KEY: "sk-platform",
        GEMINI_API_KEY: "gemini-platform"
      })
    ).resolves.toMatchObject({
      providers: [
        { provider: "openai", label: "OpenAI", configured: false, platformAvailable: true },
        { provider: "anthropic", label: "Claude", configured: true, keyHint: "sk-...ude", platformAvailable: false },
        { provider: "gemini", label: "Gemini", configured: false, platformAvailable: true }
      ]
    });
  });
});

describe("wrong-note AI analysis", () => {
  it("builds a bounded prompt from wrong-note context", () => {
    const prompt = buildWrongNotePrompt({
      stem: "事务原子性是什么？",
      options: [
        { key: "A", text: "全部成功或全部失败" },
        { key: "B", text: "并发隔离" }
      ],
      userAnswer: "B",
      correctAnswer: "A",
      officialExplanation: "原子性要求事务不可分割。",
      knowledgeNodes: ["事务基础"],
      errorCount: 2
    });

    expect(prompt.instructions).toContain("简体中文");
    expect(prompt.input).toContain("事务原子性是什么？");
    expect(prompt.input).toContain("学员答案：B");
    expect(prompt.input).toContain("正确答案：A");
  });

  it("writes AI analysis and a succeeded call when generation succeeds", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls);
    let input: unknown = null;

    await expect(
      generateWrongNoteAiAnalysis("user_1", "wrong_1", {
        db: db as never,
        generateText: async (request) => {
          input = request.input;
          return { text: "这是一段 AI 解析。", usage: { output_tokens: 8 } };
        }
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        analysis: "这是一段 AI 解析。",
        aiCallId: "call_1"
      }
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "wrongNote.update",
        args: expect.objectContaining({
          data: {
            aiAnalysis: "这是一段 AI 解析。"
          }
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiCall.update",
        args: expect.objectContaining({
          data: expect.objectContaining({
            status: "succeeded"
          })
        })
      })
    );
    expect(typeof input).toBe("string");
  });

  it("sends platform question images as vision input", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls, {
      capabilities: ["text", "vision"],
      question: questionRecord({
        payload: {
          stemBlocks: [
            { type: "text", text: "看图作答。" },
            { type: "image", sourceUrl: "", assetId: "asset_1", alt: "ER 图" }
          ],
          options: [
            { key: "A", text: "实体 A" },
            { key: "B", text: "实体 B" }
          ]
        }
      })
    });
    let input: unknown = null;

    await expect(
      generateQuestionExplanation("user_1", "question_1", {
        db: db as never,
        readAssetBytes: async () => Buffer.from("fake-png"),
        generateText: async (request) => {
          input = request.input;
          return { text: "图片解析。", usage: { output_tokens: 6 } };
        }
      })
    ).resolves.toMatchObject({ ok: true });

    expect(Array.isArray(input)).toBe(true);
    expect(input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("题干图片 1：ER 图") }),
        expect.objectContaining({ type: "image", mimeType: "image/png", dataBase64: Buffer.from("fake-png").toString("base64") })
      ])
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiCall.create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            imageCount: 1,
            promptVersion: "question-explain-v2"
          })
        })
      })
    );
  });

  it("fails clearly for external-only question images", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls, {
      question: questionRecord({
        payload: {
          stemBlocks: [{ type: "image", sourceUrl: "https://example.com/question.png", alt: "题图" }],
          options: [{ key: "A", text: "A" }]
        }
      })
    });

    await expect(
      generateQuestionExplanation("user_1", "question_1", {
        db: db as never,
        generateText: async () => ({ text: "不应调用。" })
      })
    ).resolves.toEqual({
      ok: false,
      error: "这道题包含外链图片，当前 AI 解析只支持平台内图片，请先将图片导入为平台资产。"
    });
    expect(calls.some((call) => call.method === "aiCall.create")).toBe(false);
  });

  it("requires a vision-capable preset for image questions", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls, {
      capabilities: ["text"],
      question: questionRecord({
        payload: {
          stemBlocks: [{ type: "image", sourceUrl: "", assetId: "asset_1", alt: "题图" }],
          options: [{ key: "A", text: "A" }]
        }
      })
    });

    await expect(
      generateQuestionExplanation("user_1", "question_1", {
        db: db as never,
        readAssetBytes: async () => Buffer.from("fake-png"),
        generateText: async () => ({ text: "不应调用。" })
      })
    ).resolves.toEqual({
      ok: false,
      error: "题目解析 绑定的默认模型缺少 vision capability。"
    });
  });

  it("uses questionVersion images for wrong-note analysis", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls, {
      capabilities: ["text", "vision"],
      wrongNote: wrongNoteRecord({
        attemptAnswer: {
          userAnswer: { value: "B" },
          questionVersion: {
            stem: "作答时题干",
            payload: {
              stemBlocks: [{ type: "image", sourceUrl: "", assetId: "asset_1", alt: "作答截图" }],
              options: [
                { key: "A", text: "A" },
                { key: "B", text: "B" }
              ]
            },
            answerKey: { value: "A" },
            explanation: "作答时解析"
          }
        }
      })
    });
    let input: unknown = null;

    await expect(
      generateWrongNoteAiAnalysis("user_1", "wrong_1", {
        db: db as never,
        readAssetBytes: async () => Buffer.from("version-image"),
        generateText: async (request) => {
          input = request.input;
          return { text: "错题图片解析。" };
        }
      })
    ).resolves.toMatchObject({ ok: true });

    expect(input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("作答时题干") }),
        expect.objectContaining({ type: "text", text: "题干图片 1：作答截图" }),
        expect.objectContaining({ type: "image", dataBase64: Buffer.from("version-image").toString("base64") })
      ])
    );
  });

  it("uses questionVersion images for attempt-answer explanations", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls, {
      capabilities: ["text", "vision"],
      attemptAnswer: attemptAnswerRecord({
        questionVersion: {
          stem: "作答记录题干",
          payload: {
            options: [
              { key: "A", text: "A", blocks: [{ type: "image", sourceUrl: "", assetId: "asset_1", alt: "选项图" }] },
              { key: "B", text: "B" }
            ]
          },
          answerKey: { value: "A" },
          explanation: "作答记录解析"
        }
      })
    });
    let input: unknown = null;

    await expect(
      generateAttemptAnswerAiExplanation("user_1", "answer_1", {
        db: db as never,
        readAssetBytes: async () => Buffer.from("attempt-image"),
        generateText: async (request) => {
          input = request.input;
          return { text: "作答图片解析。" };
        }
      })
    ).resolves.toMatchObject({ ok: true });

    expect(input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "选项 A 图片 1：选项图" }),
        expect.objectContaining({ type: "image", dataBase64: Buffer.from("attempt-image").toString("base64") })
      ])
    );
  });

  it("retries a failed wrong-note AI call", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls);

    await expect(
      retryFailedAiCall("user_1", "failed_1", {
        db: db as never,
        generateText: async () => ({ text: "重试后的 AI 解析。", usage: { total_tokens: 16 } })
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        analysis: "重试后的 AI 解析。",
        aiCallId: "call_1",
        retryOfAiCallId: "failed_1"
      }
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiCall.findFirst",
        args: expect.objectContaining({
          where: expect.objectContaining({
            id: "failed_1",
            userId: "user_1",
            status: "failed"
          })
        })
      })
    );
  });

  it("keeps the old analysis and records a failed call when generation fails", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createAiDb(calls);

    await expect(
      generateWrongNoteAiAnalysis("user_1", "wrong_1", {
        db: db as never,
        generateText: async () => {
          throw new Error("model unavailable");
        }
      })
    ).resolves.toEqual({
      ok: false,
      error: "model unavailable"
    });

    expect(calls.some((call) => call.method === "wrongNote.update")).toBe(false);
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiCall.update",
        args: expect.objectContaining({
          data: {
            status: "failed",
            errorSummary: "model unavailable"
          }
        })
      })
    );
  });
});

describe("AI provider presets", () => {
  it("saves OpenAI model presets for task routing", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const tx = {
      aiProviderPreset: {
        upsert: async (args: unknown) => {
          calls.push({ method: "aiProviderPreset.upsert", args });
          return { id: "preset_1" };
        }
      },
      aiProviderPresetTask: {
        deleteMany: async (args: unknown) => {
          calls.push({ method: "aiProviderPresetTask.deleteMany", args });
          return { count: 1 };
        },
        createMany: async (args: unknown) => {
          calls.push({ method: "aiProviderPresetTask.createMany", args });
          return { count: 2 };
        }
      }
    };
    const db = {
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        calls.push({ method: "$transaction" });
        return callback(tx);
      }
    };

    await expect(
      upsertAiProviderPreset(
        {
          provider: "openai",
          model: "gpt-5.4-e2e",
          label: "",
          capabilities: ["text", "json"],
          defaultForTasks: ["explain_question", "extract_questions"],
          temperature: "0.2",
          maxTokens: "640",
          enabled: true
        },
        db as never
      )
    ).resolves.toEqual({ ok: true });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiProviderPreset.upsert",
        args: expect.objectContaining({
          create: expect.objectContaining({
            provider: "openai",
            model: "gpt-5.4-e2e",
            label: "gpt-5.4-e2e",
            capabilities: ["text", "json"],
            temperature: 0.2,
            maxTokens: 640,
            enabled: true
          })
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiProviderPresetTask.deleteMany",
        args: {
          where: {
            taskType: {
              in: ["explain_question", "extract_questions"]
            }
          }
        }
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiProviderPresetTask.createMany",
        args: {
          data: [
            { presetId: "preset_1", taskType: "explain_question" },
            { presetId: "preset_1", taskType: "extract_questions" }
          ],
          skipDuplicates: true
        }
      })
    );
  });

  it("rejects default tasks that are missing required capabilities", async () => {
    await expect(
      upsertAiProviderPreset({
        provider: "openai",
        model: "gpt-5.4-e2e",
        label: "E2E",
        capabilities: ["text"],
        defaultForTasks: ["extract_questions"],
        enabled: true
      })
    ).resolves.toEqual({
      ok: false,
      error: "模型 capability 不满足 题目抽取 默认任务路由要求。"
    });
  });

  it("validates preset token limits", async () => {
    await expect(
      upsertAiProviderPreset({
        provider: "openai",
        model: "gpt-5.4-e2e",
        label: "E2E",
        defaultForTasks: ["explain_question"],
        maxTokens: "0",
        enabled: true
      })
    ).resolves.toEqual({
      ok: false,
      error: "max tokens 必须大于 0。"
    });
  });
});

describe("AI usage limits", () => {
  it("blocks users over the daily AI call limit", async () => {
    const db = {
      aiCall: {
        count: async () => 2,
        findMany: async () => []
      }
    };

    await expect(
      assertAiUsageAllowed("user_1", "byok", db as never, {
        OPENEXAM_DAILY_AI_CALL_LIMIT: "2"
      })
    ).resolves.toEqual({
      ok: false,
      error: "今日 AI 调用次数已达到上限 2 次。"
    });
  });

  it("blocks platform-key usage over the token budget", async () => {
    const db = {
      aiCall: {
        count: async () => 1,
        findMany: async () => [
          {
            usage: {
              total_tokens: 120
            }
          }
        ]
      }
    };

    await expect(
      assertAiUsageAllowed("user_1", "platform", db as never, {
        OPENEXAM_DAILY_AI_CALL_LIMIT: "10",
        OPENEXAM_DAILY_PLATFORM_TOKEN_LIMIT: "100"
      })
    ).resolves.toEqual({
      ok: false,
      error: "平台 Key 今日 Token 预算已达到上限 100。"
    });
  });
});

type AiDbFixtureOptions = {
  attemptAnswer?: unknown;
  capabilities?: string[];
  question?: unknown;
  wrongNote?: unknown;
};

function createAiDb(calls: { method: string; args?: unknown }[], options: AiDbFixtureOptions = {}) {
  return {
    aiProviderPresetTask: {
      findUnique: async () => ({
        preset: {
          provider: "openai",
          model: "gpt-5.5",
          capabilities: options.capabilities ?? ["text"],
          enabled: true,
          maxTokens: 700,
          temperature: null
        }
      })
    },
    wrongNote: {
      findFirst: async () => options.wrongNote ?? wrongNoteRecord(),
      update: async (args: unknown) => {
        calls.push({ method: "wrongNote.update", args });
        return args;
      }
    },
    attemptAnswer: {
      findFirst: async () => options.attemptAnswer ?? attemptAnswerRecord(),
      update: async (args: unknown) => {
        calls.push({ method: "attemptAnswer.update", args });
        return args;
      }
    },
    question: {
      findFirst: async () => options.question ?? questionRecord()
    },
    asset: {
      findUnique: async (args: unknown) => {
        calls.push({ method: "asset.findUnique", args });
        return {
          id: "asset_1",
          ownerId: "user_1",
          visibility: "private",
          mimeType: "image/png",
          sizeBytes: 16,
          storageKey: "questions/user_1/asset_1.png"
        };
      }
    },
    aiCall: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "aiCall.findFirst", args });
        return {
          id: "failed_1",
          inputContextSource: "wrong_note:wrong_1"
        };
      },
      create: async (args: unknown) => {
        calls.push({ method: "aiCall.create", args });
        return { id: "call_1" };
      },
      update: async (args: unknown) => {
        calls.push({ method: "aiCall.update", args });
        return args;
      }
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  };
}

function wrongNoteRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "wrong_1",
    errorCount: 2,
    mistakeTags: [],
    userNotes: null,
    attemptAnswer: {
      userAnswer: { value: "B" },
      questionVersion: null
    },
    question: questionRecord(),
    ...overrides
  };
}

function attemptAnswerRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "answer_1",
    userAnswer: { value: "B" },
    questionVersion: null,
    question: questionRecord(),
    ...overrides
  };
}

function questionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "question_1",
    kind: "single_choice",
    stem: "事务原子性是什么？",
    payload: {
      options: [
        { key: "A", text: "全部成功或全部失败" },
        { key: "B", text: "并发隔离" }
      ]
    },
    answerKey: { value: "A" },
    explanation: "原子性要求事务不可分割。",
    versions: [],
    knowledgeBindings: [
      {
        knowledgeNode: {
          title: "事务基础"
        }
      }
    ],
    ...overrides
  };
}
