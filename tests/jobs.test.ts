import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { processJob, recoverStaleJobs } from "@openexam/core/jobs";
import { materialJobType } from "@openexam/core/materials";

const jobRecord = {
  id: "job_1",
  type: "unknown_job",
  status: "queued",
  priority: 100,
  userId: "user_1",
  payload: {},
  result: null,
  error: null,
  progress: 0,
  runAt: new Date("2026-05-05T00:00:00.000Z"),
  startedAt: null,
  finishedAt: null,
  createdAt: new Date("2026-05-05T00:00:00.000Z"),
  updatedAt: new Date("2026-05-05T00:00:00.000Z")
};

describe("job claiming", () => {
  it("does not process a job when the atomic claim loses the race", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      job: {
        findFirst: async (args: unknown) => {
          calls.push({ method: "job.findFirst", args });
          return jobRecord;
        },
        updateMany: async (args: unknown) => {
          calls.push({ method: "job.updateMany", args });
          return { count: 0 };
        },
        update: async (args: unknown) => {
          calls.push({ method: "job.update", args });
          return args;
        }
      }
    };

    await expect(processJob("job_1", { db: db as never })).resolves.toEqual({
      ok: false,
      error: "任务已被其他执行者领取或状态已变化。"
    });
    expect(calls.some((call) => call.method === "job.update")).toBe(false);
  });

  it("passes material extraction timeout and disables provider retries", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "openexam-job-material-"));

    try {
      await writeFile(path.join(storageRoot, "input.txt"), "题干：事务原子性是什么？\nA. 全部成功或全部失败\n答案：A", "utf8");

      const calls: { method: string; args?: unknown }[] = [];
      const requests: unknown[] = [];
      const job = {
        ...jobRecord,
        type: materialJobType,
        payload: { materialId: "material_1" }
      };
      const db = {
        job: {
          findFirst: async (args: unknown) => {
            calls.push({ method: "job.findFirst", args });
            return job;
          },
          updateMany: async (args: unknown) => {
            calls.push({ method: "job.updateMany", args });
            return { count: 1 };
          },
          findUnique: async () => job,
          update: async (args: unknown) => {
            calls.push({ method: "job.update", args });
            return args;
          }
        },
        material: {
          findUnique: async () => ({
            id: "material_1",
            ownerId: "user_1",
            title: "资料",
            mimeType: "text/plain",
            storageKey: "input.txt",
            bindingScope: null
          }),
          update: async (args: unknown) => {
            calls.push({ method: "material.update", args });
            return args;
          }
        },
        aiProviderPresetTask: {
          findUnique: async () => ({
            preset: {
              provider: "openai",
              model: "deepseek-v4-pro",
              capabilities: ["json"],
              enabled: true,
              maxTokens: 8192,
              temperature: null
            }
          })
        },
        knowledgeNode: {
          findMany: async () => []
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
        materialQuestionCandidate: {
          deleteMany: async (args: unknown) => {
            calls.push({ method: "materialQuestionCandidate.deleteMany", args });
            return { count: 0 };
          },
          createMany: async (args: unknown) => {
            calls.push({ method: "materialQuestionCandidate.createMany", args });
            return { count: 1 };
          }
        },
        $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
      };

      await expect(
        processJob("job_1", {
          db: db as never,
          env: {
            DATABASE_URL: "postgresql://openexam:openexam@localhost:5432/openexam?schema=public",
            LOCAL_STORAGE_DIR: storageRoot,
            OPENEXAM_MATERIAL_EXTRACT_TIMEOUT_MS: "123000"
          },
          generateText: async (request) => {
            requests.push(request);
            return {
              text: JSON.stringify({
                questions: [
                  {
                    kind: "single_choice",
                    stem: "事务原子性是什么？",
                    options: { A: "全部成功或全部失败", B: "并发隔离", C: "持久保存", D: "自动恢复" },
                    answer: "A"
                  }
                ]
              })
            };
          }
        })
      ).resolves.toEqual({ ok: true, data: { jobId: "job_1" } });
      expect(requests[0]).toMatchObject({
        model: "deepseek-v4-pro",
        timeoutMs: 123000,
        maxRetries: 0
      });
    } finally {
      await rm(storageRoot, { force: true, recursive: true });
    }
  });
});

describe("stale job recovery", () => {
  it("requeues running jobs older than the configured timeout", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      job: {
        updateMany: async (args: unknown) => {
          calls.push({ method: "job.updateMany", args });
          return { count: calls.length === 1 ? 2 : 0 };
        }
      }
    };
    const now = new Date("2026-05-05T12:00:00.000Z");

    await expect(
      recoverStaleJobs({
        db: db as never,
        env: { OPENEXAM_JOB_STALE_MS: "60000" },
        now
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        count: 2
      }
    });
    expect(calls[0]).toEqual({
      method: "job.updateMany",
      args: {
        where: {
          status: "running",
          type: {
            not: materialJobType
          },
          startedAt: {
            lte: new Date("2026-05-05T11:59:00.000Z")
          }
        },
        data: {
          status: "queued",
          error: "任务运行超时，已自动重新排队。",
          progress: 0,
          runAt: now,
          startedAt: null,
          finishedAt: null
        }
      }
    });
    expect(calls[1]).toMatchObject({
      method: "job.updateMany",
      args: {
        where: {
          status: "running",
          type: materialJobType,
          startedAt: {
            lte: new Date("2026-05-05T11:35:00.000Z")
          }
        }
      }
    });
  });

  it("uses the 15-minute default when timeout config is too low", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      job: {
        updateMany: async (args: unknown) => {
          calls.push({ method: "job.updateMany", args });
          return { count: 0 };
        }
      }
    };
    const now = new Date("2026-05-05T12:00:00.000Z");

    await recoverStaleJobs({
      db: db as never,
      env: { OPENEXAM_JOB_STALE_MS: "1000" },
      now
    });
    expect(calls[0]).toMatchObject({
      args: {
        where: {
          type: {
            not: materialJobType
          },
          startedAt: {
            lte: new Date("2026-05-05T11:45:00.000Z")
          }
        }
      }
    });
  });

  it("uses a separate stale timeout for material extraction jobs", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      job: {
        updateMany: async (args: unknown) => {
          calls.push({ method: "job.updateMany", args });
          return { count: 0 };
        }
      }
    };
    const now = new Date("2026-05-05T12:00:00.000Z");

    await recoverStaleJobs({
      db: db as never,
      env: {
        OPENEXAM_JOB_STALE_MS: "60000",
        OPENEXAM_MATERIAL_EXTRACT_TIMEOUT_MS: "1200000",
        OPENEXAM_MATERIAL_EXTRACT_JOB_STALE_MS: "1500000"
      },
      now
    });
    expect(calls[1]).toMatchObject({
      args: {
        where: {
          type: materialJobType,
          startedAt: {
            lte: new Date("2026-05-05T11:35:00.000Z")
          }
        }
      }
    });
  });
});
