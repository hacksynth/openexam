import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { processNextJob, type JobProcessorOptions } from "./jobs";
import { prisma } from "./prisma";

type WorkerLogger = Pick<Console, "error" | "info" | "warn">;
type WorkerLogLevel = "error" | "info" | "warn";
type WorkerJobResult = Awaited<ReturnType<typeof processNextJob>>;
type WorkerJobProcessor = (options: JobProcessorOptions) => Promise<WorkerJobResult>;

export type WorkerHealthStatus = "starting" | "polling" | "stopped";

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
  const jobProcessor = options.jobProcessor ?? processNextJob;

  writeWorkerLog(logger, "info", {
    event: "worker.started",
    message: `OpenExam worker started. Polling every ${pollMs}ms.`,
    pollMs,
    healthPath
  });
  await safeWriteWorkerHealth(
    healthPath,
    createWorkerHealth({
      status: "starting",
      event: "worker.started",
      pollMs,
      maxAgeMs: healthMaxAgeMs
    }),
    logger
  );

  try {
    while (!options.signal?.aborted) {
      const result = await jobProcessor(options);

      if (result.ok) {
        writeWorkerLog(logger, "info", {
          event: "worker.job_processed",
          message: `Processed job ${result.data.jobId}.`,
          jobId: result.data.jobId
        });
        await safeWriteWorkerHealth(
          healthPath,
          createWorkerHealth({
            status: "polling",
            event: "worker.job_processed",
            pollMs,
            maxAgeMs: healthMaxAgeMs,
            lastJobId: result.data.jobId
          }),
          logger
        );
        continue;
      }

      if (result.error === noQueuedJobError) {
        writeWorkerLog(logger, "info", {
          event: "worker.poll_idle",
          message: "No queued job available.",
          pollMs
        });
        await safeWriteWorkerHealth(
          healthPath,
          createWorkerHealth({
            status: "polling",
            event: "worker.poll_idle",
            pollMs,
            maxAgeMs: healthMaxAgeMs
          }),
          logger
        );
      } else {
        writeWorkerLog(logger, "warn", {
          event: "worker.job_failed",
          message: `Job processing skipped or failed: ${result.error}`,
          error: result.error
        });
        await safeWriteWorkerHealth(
          healthPath,
          createWorkerHealth({
            status: "polling",
            event: "worker.job_failed",
            pollMs,
            maxAgeMs: healthMaxAgeMs,
            lastError: result.error
          }),
          logger
        );
      }

      await sleep(pollMs, options.signal);
    }
  } finally {
    await safeWriteWorkerHealth(
      healthPath,
      createWorkerHealth({
        status: "stopped",
        event: "worker.stopped",
        pollMs,
        maxAgeMs: healthMaxAgeMs
      }),
      logger
    );
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
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

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
    (health.status === "starting" || health.status === "polling" || health.status === "stopped") &&
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
