import { describe, expect, it } from "vitest";
import {
  buildWrongNotePrompt,
  decryptAiSecret,
  encryptAiSecret,
  generateWrongNoteAiAnalysis,
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
        source: "platform"
      }
    });
    await expect(resolveOpenAiCredential("user_1", db as never, {})).resolves.toEqual({
      ok: false,
      error: "请先在个人设置中配置 OpenAI API Key。"
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

function createAiDb(calls: { method: string; args?: unknown }[]) {
  return {
    aiProviderPreset: {
      findFirst: async () => ({
        model: "gpt-5.5",
        maxTokens: 700
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
