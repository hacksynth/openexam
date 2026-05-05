import { pathToFileURL } from "node:url";
import { processNextJob, type JobProcessorOptions } from "./jobs";
import { prisma } from "./prisma";

type WorkerLogger = Pick<Console, "error" | "info" | "warn">;

export type WorkerOptions = JobProcessorOptions & {
  pollMs?: number;
  signal?: AbortSignal;
  logger?: WorkerLogger;
};

const defaultPollMs = 3000;

export async function runWorkerLoop(options: WorkerOptions = {}) {
  const logger = options.logger ?? console;
  const pollMs = normalizePollMs(options.pollMs ?? Number(options.env?.OPENEXAM_WORKER_POLL_MS ?? process.env.OPENEXAM_WORKER_POLL_MS));

  logger.info(`OpenExam worker started. Polling every ${pollMs}ms.`);

  while (!options.signal?.aborted) {
    const result = await processNextJob(options);

    if (result.ok) {
      logger.info(`Processed job ${result.data.jobId}.`);
      continue;
    }

    if (result.error !== "暂无可处理任务。") {
      logger.warn(`Job processing skipped or failed: ${result.error}`);
    }

    await sleep(pollMs, options.signal);
  }

  logger.info("OpenExam worker stopped.");
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

    const timeout = setTimeout(resolve, ms);
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
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
