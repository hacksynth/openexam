import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_URL: z.string().url().optional(),
  AI_KEY_ENCRYPTION_SECRET: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENEXAM_DAILY_AI_CALL_LIMIT: z.coerce.number().int().positive().default(50),
  OPENEXAM_DAILY_PLATFORM_TOKEN_LIMIT: z.coerce.number().int().positive().default(100000),
  OPENEXAM_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10485760),
  OPENEXAM_WORKER_POLL_MS: z.coerce.number().int().positive().default(3000),
  OPENEXAM_JOB_STALE_MS: z.coerce.number().int().positive().default(900000),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  NEXT_PUBLIC_APP_NAME: z.string().default("OpenExam")
});

export function readEnv(source = process.env) {
  return envSchema.parse(source);
}
