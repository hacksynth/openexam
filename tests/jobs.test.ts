import { describe, expect, it } from "vitest";
import { processJob, recoverStaleJobs } from "@openexam/core/jobs";

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
});

describe("stale job recovery", () => {
  it("requeues running jobs older than the configured timeout", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      job: {
        updateMany: async (args: unknown) => {
          calls.push({ method: "job.updateMany", args });
          return { count: 2 };
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
          startedAt: {
            lte: new Date("2026-05-05T11:45:00.000Z")
          }
        }
      }
    });
  });
});
