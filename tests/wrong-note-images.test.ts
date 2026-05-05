import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Visibility } from "@prisma/client";
import { canReadAsset } from "@openexam/core/assets";
import { processJob } from "@openexam/core/jobs";
import {
  buildWrongNoteReviewCardPrompt,
  generateOpenAiImage,
  listWrongNoteReviewCardViews,
  processWrongNoteReviewCardJob,
  queueWrongNoteReviewCard,
  wrongNoteReviewCardJobType
} from "@openexam/core/wrong-note-images";

const databaseUrl = "postgresql://openexam:openexam@localhost:5432/openexam?schema=public";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("wrong-note review-card prompts", () => {
  it("includes the learning context without secrets", () => {
    const prompt = buildWrongNoteReviewCardPrompt({
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

    expect(prompt).toContain("事务原子性是什么？");
    expect(prompt).toContain("我的答案：B");
    expect(prompt).toContain("正确答案：A");
    expect(prompt).toContain("事务基础");
    expect(prompt).not.toContain("sk-");
  });
});

describe("wrong-note review-card jobs", () => {
  it("refuses to queue a review-card job for another user's wrong note", async () => {
    const db = {
      wrongNote: {
        findFirst: async () => null
      }
    };

    await expect(queueWrongNoteReviewCard("user_1", "wrong_2", db as never)).resolves.toEqual({
      ok: false,
      error: "错题不存在。"
    });
  });

  it("dispatches and succeeds a wrong-note review-card job", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const tempDir = await makeTempDir();
    const db = createWrongNoteImageDb(calls);

    await expect(
      processJob("job_1", {
        db: db as never,
        env: env(tempDir),
        generateImage: async (request) => {
          expect(request.prompt).toContain("事务原子性是什么？");
          return {
            bytes: Buffer.from("png-bytes"),
            mimeType: "image/png"
          };
        }
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        jobId: "job_1"
      }
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "asset.create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            ownerId: "user_1",
            visibility: "private",
            source: "wrong_note_review_card"
          })
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "job.update",
        args: expect.objectContaining({
          data: expect.objectContaining({
            status: "succeeded",
            result: {
              wrongNoteId: "wrong_1",
              assetId: "asset_1"
            }
          })
        })
      })
    );
  });

  it("shows the latest successful review-card asset for a wrong note", async () => {
    const db = {
      job: {
        findMany: async () => [
          {
            id: "job_new",
            status: "succeeded",
            progress: 100,
            error: null,
            payload: { wrongNoteId: "wrong_1" },
            result: { wrongNoteId: "wrong_1", assetId: "asset_new" },
            updatedAt: new Date("2026-05-05T10:00:00.000Z")
          },
          {
            id: "job_old",
            status: "succeeded",
            progress: 100,
            error: null,
            payload: { wrongNoteId: "wrong_1" },
            result: { wrongNoteId: "wrong_1", assetId: "asset_old" },
            updatedAt: new Date("2026-05-05T09:00:00.000Z")
          }
        ]
      },
      asset: {
        findMany: async () => [
          {
            id: "asset_new",
            mimeType: "image/png",
            createdAt: new Date("2026-05-05T10:00:00.000Z")
          },
          {
            id: "asset_old",
            mimeType: "image/png",
            createdAt: new Date("2026-05-05T09:00:00.000Z")
          }
        ]
      }
    };
    const views = await listWrongNoteReviewCardViews("user_1", ["wrong_1"], db as never);

    expect(views.get("wrong_1")).toMatchObject({
      latestJob: {
        id: "job_new",
        status: "succeeded"
      },
      asset: {
        id: "asset_new"
      }
    });
  });

  it("marks the AI call failed when image generation returns no usable image", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const tempDir = await makeTempDir();
    const db = createWrongNoteImageDb(calls);

    await expect(
      processWrongNoteReviewCardJob("job_1", "user_1", { wrongNoteId: "wrong_1" }, {
        db: db as never,
        env: env(tempDir),
        generateImage: async () => {
          throw new Error("OpenAI 没有返回图片数据。");
        }
      })
    ).rejects.toThrow("OpenAI 没有返回图片数据。");
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiCall.update",
        args: expect.objectContaining({
          data: {
            status: "failed",
            errorSummary: "OpenAI 没有返回图片数据。"
          }
        })
      })
    );
  });

  it("fails clearly when OpenAI image responses lack base64 image data", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ created: 1, data: [{}] }));
    });
    const port = await listen(server);

    await expect(
      generateOpenAiImage({
        apiKey: "sk-test",
        baseURL: `http://127.0.0.1:${port}/v1`,
        model: "gpt-image-1.5",
        prompt: "生成复习卡",
        userId: "user_1"
      })
    ).rejects.toThrow("OpenAI 没有返回图片数据。");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("private asset access", () => {
  it("allows owners and admins to read private assets", () => {
    const asset = {
      ownerId: "user_1",
      visibility: Visibility.private
    };

    expect(canReadAsset(asset, { userId: "user_1" })).toBe(true);
    expect(canReadAsset(asset, { userId: "user_2" })).toBe(false);
    expect(canReadAsset(asset, { userId: "admin_1", isAdmin: true })).toBe(true);
  });
});

function createWrongNoteImageDb(calls: { method: string; args?: unknown }[]) {
  const job = {
    id: "job_1",
    type: wrongNoteReviewCardJobType,
    status: "queued",
    priority: 100,
    userId: "user_1",
    payload: { wrongNoteId: "wrong_1" },
    result: null,
    error: null,
    progress: 0,
    runAt: new Date("2026-05-05T00:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
    createdAt: new Date("2026-05-05T00:00:00.000Z"),
    updatedAt: new Date("2026-05-05T00:00:00.000Z")
  };

  return {
    job: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "job.findFirst", args });
        return matchesJobWhere(job, readWhere(args)) ? { ...job } : null;
      },
      findUnique: async (args: unknown) => {
        calls.push({ method: "job.findUnique", args });
        const id = readWhere(args).id;

        return id === job.id ? { ...job } : null;
      },
      updateMany: async (args: unknown) => {
        calls.push({ method: "job.updateMany", args });

        if (!matchesJobWhere(job, readWhere(args))) {
          return { count: 0 };
        }

        Object.assign(job, readData(args));

        return { count: 1 };
      },
      update: async (args: unknown) => {
        calls.push({ method: "job.update", args });
        Object.assign(job, readData(args));

        return args;
      }
    },
    wrongNote: {
      findFirst: async () => wrongNoteRecord()
    },
    aiProviderPresetTask: {
      findUnique: async () => ({
        preset: {
          provider: "openai",
          model: "gpt-image-1.5",
          capabilities: ["image"],
          enabled: true,
          maxTokens: null,
          temperature: null
        }
      })
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
    asset: {
      create: async (args: unknown) => {
        calls.push({ method: "asset.create", args });
        return { id: "asset_1" };
      }
    }
  };
}

function readWhere(args: unknown) {
  if (args && typeof args === "object" && "where" in args && args.where && typeof args.where === "object") {
    return args.where as Record<string, unknown>;
  }

  return {};
}

function readData(args: unknown) {
  if (args && typeof args === "object" && "data" in args && args.data && typeof args.data === "object") {
    return args.data as Record<string, unknown>;
  }

  return {};
}

function matchesJobWhere(job: { id: string; status: string; runAt: Date }, where: Record<string, unknown>) {
  if (typeof where.id === "string" && where.id !== job.id) {
    return false;
  }

  if (where.status && typeof where.status === "object" && "in" in where.status && Array.isArray(where.status.in)) {
    return where.status.in.includes(job.status);
  }

  if (typeof where.status === "string" && where.status !== job.status) {
    return false;
  }

  if (where.runAt && typeof where.runAt === "object" && "lte" in where.runAt && where.runAt.lte instanceof Date && job.runAt > where.runAt.lte) {
    return false;
  }

  return true;
}

function wrongNoteRecord() {
  return {
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
  };
}

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "openexam-review-card-"));

  tempDirs.push(dir);

  return dir;
}

function env(localStorageDir: string) {
  return {
    DATABASE_URL: databaseUrl,
    LOCAL_STORAGE_DIR: localStorageDir
  };
}

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address && typeof address === "object") {
        resolve(address.port);
      }
    });
  });
}
