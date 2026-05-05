import { describe, expect, it } from "vitest";
import {
  buildWrongNotePrompt,
  decryptAiSecret,
  encryptAiSecret,
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

    await expect(
      generateWrongNoteAiAnalysis("user_1", "wrong_1", {
        db: db as never,
        generateText: async () => ({ text: "这是一段 AI 解析。", usage: { output_tokens: 8 } })
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
    const db = {
      aiProviderPreset: {
        upsert: async (args: unknown) => {
          calls.push({ method: "aiProviderPreset.upsert", args });
          return args;
        }
      }
    };

    await expect(
      upsertAiProviderPreset(
        {
          provider: "openai",
          model: "gpt-5.4-e2e",
          label: "",
          defaultForTask: "explain_question",
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
            defaultForTask: "explain_question",
            temperature: 0.2,
            maxTokens: 640,
            enabled: true
          })
        })
      })
    );
  });

  it("validates preset token limits", async () => {
    await expect(
      upsertAiProviderPreset({
        provider: "openai",
        model: "gpt-5.4-e2e",
        label: "E2E",
        defaultForTask: "explain_question",
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

function createAiDb(calls: { method: string; args?: unknown }[]) {
  return {
    aiProviderPreset: {
      findFirst: async () => ({
        model: "gpt-5.5",
        maxTokens: 700,
        temperature: null
      })
    },
    wrongNote: {
      findFirst: async () => ({
        id: "wrong_1",
        errorCount: 2,
        attemptAnswer: {
          userAnswer: { value: "B" },
          questionVersion: null
        },
        question: {
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
          ]
        }
      }),
      update: async (args: unknown) => {
        calls.push({ method: "wrongNote.update", args });
        return args;
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
