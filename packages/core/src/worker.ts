import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { processNextJob, type JobProcessorOptions } from "./jobs";
import { prisma } from "./prisma";

type WorkerLogger = Pick<Console, "error" | "info" | "warn">;
type WorkerLogLevel = "error" | "info" | "warn";
type WorkerJobResult = Awaited<ReturnType<typeof processNextJob>>;
type WorkerJobProcessor = (options: JobProcessorOptions) => Promise<WorkerJobResult>;
type WorkerHealthState = Omit<Parameters<typeof createWorkerHealth>[0], "now" | "pid">;

export type WorkerHealthStatus = "starting" | "polling" | "processing" | "stopped";

export type WorkerHealth = {
  status: WorkerHealthStatus;
  event: string;
  updatedAt: string;
  pid: number;
  pollMs: number;
  maxAgeMs: number;
  lastJobId?: string;
  lastError?: string;
};

export type WorkerLogEntry = {
  event: string;
  message: string;
  pollMs?: number;
  jobId?: string;
  error?: string;
  healthPath?: string;
  status?: WorkerHealthStatus;
};

export type WorkerOptions = JobProcessorOptions & {
  pollMs?: number;
  signal?: AbortSignal;
  logger?: WorkerLogger;
  healthPath?: string | null;
  healthMaxAgeMs?: number;
  jobProcessor?: WorkerJobProcessor;
};

const defaultPollMs = 3000;
const noQueuedJobError = "暂无可处理任务。";

export const defaultWorkerHealthPath = "/tmp/openexam-worker-health.json";
export const defaultWorkerHealthMaxAgeMs = 30000;

export async function runWorkerLoop(options: WorkerOptions = {}) {
  const logger = options.logger ?? console;
  const env = options.env ?? process.env;
  const pollMs = normalizePollMs(options.pollMs ?? Number(env.OPENEXAM_WORKER_POLL_MS));
  const healthPath = resolveWorkerHealthPath(options.healthPath ?? env.OPENEXAM_WORKER_HEALTH_PATH);
  const healthMaxAgeMs = resolveWorkerHealthMaxAgeMs(options.healthMaxAgeMs ?? env.OPENEXAM_WORKER_HEALTH_MAX_AGE_MS);
  const healthHeartbeatMs = resolveWorkerHealthHeartbeatMs(healthMaxAgeMs, pollMs);
  const jobProcessor = options.jobProcessor ?? processNextJob;
  let currentHealthState: WorkerHealthState = {
    status: "starting",
    event: "worker.started",
    pollMs,
    maxAgeMs: healthMaxAgeMs
  };
  const writeHealth = async (state: WorkerHealthState) => {
    currentHealthState = state;
    await safeWriteWorkerHealth(healthPath, createWorkerHealth(state), logger);
  };

  writeWorkerLog(logger, "info", {
    event: "worker.started",
    message: `OpenExam worker started. Polling every ${pollMs}ms.`,
    pollMs,
    healthPath
  });
  await writeHealth(currentHealthState);
  const stopHealthHeartbeat = startWorkerHealthHeartbeat({
    healthPath,
    heartbeatMs: healthHeartbeatMs,
    getHealthState: () => currentHealthState,
    logger
  });

  try {
    while (!options.signal?.aborted) {
      await writeHealth({
        status: "processing",
        event: "worker.job_processing",
        pollMs,
        maxAgeMs: healthMaxAgeMs
      });
      const result = await jobProcessor(options);

      if (result.ok) {
        writeWorkerLog(logger, "info", {
          event: "worker.job_processed",
          message: `Processed job ${result.data.jobId}.`,
          jobId: result.data.jobId
        });
        await writeHealth({
          status: "polling",
          event: "worker.job_processed",
          pollMs,
          maxAgeMs: healthMaxAgeMs,
          lastJobId: result.data.jobId
        });
        continue;
      }

      if (result.error === noQueuedJobError) {
        writeWorkerLog(logger, "info", {
          event: "worker.poll_idle",
          message: "No queued job available.",
          pollMs
        });
        await writeHealth({
          status: "polling",
          event: "worker.poll_idle",
          pollMs,
          maxAgeMs: healthMaxAgeMs
        });
      } else {
        writeWorkerLog(logger, "warn", {
          event: "worker.job_failed",
          message: `Job processing skipped or failed: ${result.error}`,
          error: result.error
        });
        await writeHealth({
          status: "polling",
          event: "worker.job_failed",
          pollMs,
          maxAgeMs: healthMaxAgeMs,
          lastError: result.error
        });
      }

      await sleep(pollMs, options.signal);
    }
  } finally {
    stopHealthHeartbeat();
    await writeHealth({
      status: "stopped",
      event: "worker.stopped",
      pollMs,
      maxAgeMs: healthMaxAgeMs
    });
    writeWorkerLog(logger, "info", {
      event: "worker.stopped",
      message: "OpenExam worker stopped.",
      status: "stopped"
    });
  }
}

export function formatWorkerLog(level: WorkerLogLevel, entry: WorkerLogEntry, now = new Date()) {
  return JSON.stringify({
    level,
    event: entry.event,
    message: entry.message,
    timestamp: now.toISOString(),
    pollMs: entry.pollMs,
    jobId: entry.jobId,
    error: entry.error,
    healthPath: entry.healthPath,
    status: entry.status
  });
}

export function writeWorkerLog(logger: WorkerLogger, level: WorkerLogLevel, entry: WorkerLogEntry, now = new Date()) {
  const line = formatWorkerLog(level, entry, now);

  if (level === "error") {
    logger.error(line);
    return;
  }

  if (level === "warn") {
    logger.warn(line);
    return;
  }

  logger.info(line);
}

export function createWorkerHealth(input: {
  status: WorkerHealthStatus;
  event: string;
  pollMs: number;
  maxAgeMs?: number;
  lastJobId?: string;
  lastError?: string;
  now?: Date;
  pid?: number;
}): WorkerHealth {
  return {
    status: input.status,
    event: input.event,
    updatedAt: (input.now ?? new Date()).toISOString(),
    pid: input.pid ?? process.pid,
    pollMs: input.pollMs,
    maxAgeMs: resolveWorkerHealthMaxAgeMs(input.maxAgeMs),
    lastJobId: input.lastJobId,
    lastError: input.lastError
  };
}

export async function writeWorkerHealth(filePath: string, health: WorkerHealth) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  await writeFile(tempPath, `${JSON.stringify(health)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export function isWorkerHealthHealthy(value: unknown, options: { maxAgeMs?: number; now?: Date } = {}) {
  if (!isWorkerHealth(value) || value.status === "stopped") {
    return false;
  }

  const updatedAtMs = Date.parse(value.updatedAt);
  const nowMs = (options.now ?? new Date()).getTime();
  const ageMs = nowMs - updatedAtMs;

  return Number.isFinite(updatedAtMs) && ageMs >= 0 && ageMs <= resolveWorkerHealthMaxAgeMs(options.maxAgeMs ?? value.maxAgeMs);
}

export function resolveWorkerHealthPath(value: string | null | undefined) {
  const path = value?.trim();

  return path || defaultWorkerHealthPath;
}

export function resolveWorkerHealthMaxAgeMs(value: number | string | null | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultWorkerHealthMaxAgeMs;
}

function resolveWorkerHealthHeartbeatMs(maxAgeMs: number, pollMs: number) {
  return Math.max(250, Math.min(pollMs, Math.floor(maxAgeMs / 2)));
}

function startWorkerHealthHeartbeat(input: {
  healthPath: string;
  heartbeatMs: number;
  getHealthState: () => WorkerHealthState;
  logger: WorkerLogger;
}) {
  let writing = false;
  const heartbeat = setInterval(() => {
    if (writing) {
      return;
    }

    writing = true;
    safeWriteWorkerHealth(input.healthPath, createWorkerHealth(input.getHealthState()), input.logger).finally(() => {
      writing = false;
    });
  }, input.heartbeatMs);

  return () => clearInterval(heartbeat);
}

async function safeWriteWorkerHealth(filePath: string, health: WorkerHealth, logger: WorkerLogger) {
  try {
    await writeWorkerHealth(filePath, health);
  } catch (error) {
    writeWorkerLog(logger, "warn", {
      event: "worker.health_write_failed",
      message: "OpenExam worker health write failed.",
      error: errorToMessage(error),
      healthPath: filePath
    });
  }
}

function isWorkerHealth(value: unknown): value is WorkerHealth {
  if (!value || typeof value !== "object") {
    return false;
  }

  const health = value as Partial<WorkerHealth>;

  return (
    (health.status === "starting" || health.status === "polling" || health.status === "processing" || health.status === "stopped") &&
    typeof health.event === "string" &&
    typeof health.updatedAt === "string" &&
    typeof health.pid === "number" &&
    typeof health.pollMs === "number" &&
    typeof health.maxAgeMs === "number"
  );
}

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizePollMs(value: number) {
  return Number.isFinite(value) && value >= 250 ? Math.floor(value) : defaultPollMs;
}

function sleep(ms: number, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      resolve();
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function isMainModule() {
  return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
}

if (isMainModule()) {
  const controller = new AbortController();

  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());

  runWorkerLoop({ signal: controller.signal })
    .catch((error) => {
      writeWorkerLog(console, "error", {
        event: "worker.crashed",
        message: "OpenExam worker crashed.",
        error: errorToMessage(error)
      });
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
