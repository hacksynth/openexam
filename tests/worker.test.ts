import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWorkerHealth,
  formatWorkerLog,
  isWorkerHealthHealthy,
  runWorkerLoop,
  writeWorkerHealth
} from "@openexam/core/worker";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("worker health", () => {
  it("writes start, poll, and stop health snapshots as JSON", async () => {
    const healthPath = path.join(await makeTempDir(), "worker-health.json");
    const started = createWorkerHealth({
      status: "starting",
      event: "worker.started",
      pollMs: 3000,
      maxAgeMs: 30000,
      now: new Date("2026-05-05T12:00:00.000Z"),
      pid: 123
    });
    const polled = createWorkerHealth({
      status: "polling",
      event: "worker.job_processed",
      pollMs: 3000,
      maxAgeMs: 30000,
      lastJobId: "job_1",
      now: new Date("2026-05-05T12:00:01.000Z"),
      pid: 123
    });
    const stopped = createWorkerHealth({
      status: "stopped",
      event: "worker.stopped",
      pollMs: 3000,
      maxAgeMs: 30000,
      now: new Date("2026-05-05T12:00:02.000Z"),
      pid: 123
    });

    await writeWorkerHealth(healthPath, started);
    await expect(readJson(healthPath)).resolves.toEqual(started);

    await writeWorkerHealth(healthPath, polled);
    await expect(readJson(healthPath)).resolves.toEqual(polled);

    await writeWorkerHealth(healthPath, stopped);
    await expect(readJson(healthPath)).resolves.toEqual(stopped);
  });

  it("marks fresh health healthy and stale or stopped health unhealthy", () => {
    const now = new Date("2026-05-05T12:00:00.000Z");
    const fresh = createWorkerHealth({
      status: "polling",
      event: "worker.poll_idle",
      pollMs: 3000,
      maxAgeMs: 30000,
      now: new Date("2026-05-05T11:59:59.000Z"),
      pid: 123
    });
    const stale = createWorkerHealth({
      status: "polling",
      event: "worker.poll_idle",
      pollMs: 3000,
      maxAgeMs: 30000,
      now: new Date("2026-05-05T11:59:29.000Z"),
      pid: 123
    });
    const stopped = createWorkerHealth({
      status: "stopped",
      event: "worker.stopped",
      pollMs: 3000,
      maxAgeMs: 30000,
      now,
      pid: 123
    });

    expect(isWorkerHealthHealthy(fresh, { now })).toBe(true);
    expect(isWorkerHealthHealthy(stale, { now })).toBe(false);
    expect(isWorkerHealthHealthy(stopped, { now })).toBe(false);
  });
});

describe("worker structured logs", () => {
  it("formats JSON lines with event, level, message, and worker context", () => {
    const now = new Date("2026-05-05T12:00:00.000Z");
    const started = JSON.parse(
      formatWorkerLog(
        "info",
        {
          event: "worker.started",
          message: "OpenExam worker started. Polling every 500ms.",
          pollMs: 500
        },
        now
      )
    );
    const processed = JSON.parse(
      formatWorkerLog(
        "info",
        {
          event: "worker.job_processed",
          message: "Processed job job_1.",
          jobId: "job_1"
        },
        now
      )
    );
    const failed = JSON.parse(
      formatWorkerLog(
        "warn",
        {
          event: "worker.job_failed",
          message: "Job processing skipped or failed: boom",
          error: "boom"
        },
        now
      )
    );

    expect(started).toMatchObject({
      level: "info",
      event: "worker.started",
      message: "OpenExam worker started. Polling every 500ms.",
      pollMs: 500,
      timestamp: "2026-05-05T12:00:00.000Z"
    });
    expect(processed).toMatchObject({
      level: "info",
      event: "worker.job_processed",
      message: "Processed job job_1.",
      jobId: "job_1"
    });
    expect(failed).toMatchObject({
      level: "warn",
      event: "worker.job_failed",
      message: "Job processing skipped or failed: boom",
      error: "boom"
    });
  });

  it("keeps the startup text visible while running a structured loop", async () => {
    const healthPath = path.join(await makeTempDir(), "worker-health.json");
    const controller = new AbortController();
    const infoLines: string[] = [];
    const warnLines: string[] = [];
    const errorLines: string[] = [];
    const logger = {
      info: (...data: unknown[]) => infoLines.push(String(data[0])),
      warn: (...data: unknown[]) => warnLines.push(String(data[0])),
      error: (...data: unknown[]) => errorLines.push(String(data[0]))
    };

    await runWorkerLoop({
      pollMs: 250,
      healthPath,
      healthMaxAgeMs: 5000,
      signal: controller.signal,
      logger,
      jobProcessor: async () => {
        controller.abort();
        return { ok: true, data: { jobId: "job_1" } };
      }
    });

    expect(infoLines.some((line) => line.includes("OpenExam worker started"))).toBe(true);
    expect(infoLines.map((line) => JSON.parse(line).event)).toEqual([
      "worker.started",
      "worker.job_processed",
      "worker.stopped"
    ]);
    expect(warnLines).toEqual([]);
    expect(errorLines).toEqual([]);
    await expect(readJson(healthPath)).resolves.toMatchObject({
      status: "stopped",
      event: "worker.stopped"
    });
  });
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "openexam-worker-"));

  tempDirs.push(dir);
  return dir;
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
