import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => (value === "" ? undefined : value);
const booleanString = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
};
const optionalNonEmptyString = z.preprocess(emptyStringToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: optionalNonEmptyString,
  AUTH_URL: optionalUrl,
  AI_KEY_ENCRYPTION_SECRET: optionalNonEmptyString,
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: optionalUrl,
  OPENAI_API_MODE: z.preprocess(emptyStringToUndefined, z.enum(["chat", "responses"]).optional()),
  OPENEXAM_DAILY_AI_CALL_LIMIT: z.coerce.number().int().positive().default(50),
  OPENEXAM_DAILY_PLATFORM_TOKEN_LIMIT: z.coerce.number().int().positive().default(100000),
  OPENEXAM_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10485760),
  OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS: z.coerce.number().int().positive().default(1048576),
  OPENEXAM_MATERIAL_EXTRACT_TIMEOUT_MS: z.coerce.number().int().positive().default(1200000),
  OPENEXAM_MATERIAL_EXTRACT_JOB_STALE_MS: z.coerce.number().int().positive().default(1500000),
  OPENEXAM_IMPORT_EXTERNAL_IMAGES: z.preprocess(booleanString, z.boolean().default(true)),
  OPENEXAM_WORKER_POLL_MS: z.coerce.number().int().positive().default(3000),
  OPENEXAM_JOB_STALE_MS: z.coerce.number().int().positive().default(900000),
  OPENEXAM_WORKER_HEALTH_PATH: z.string().default("/tmp/openexam-worker-health.json"),
  OPENEXAM_WORKER_HEALTH_MAX_AGE_MS: z.coerce.number().int().positive().default(30000),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ENDPOINT: z.string().default(""),
  S3_BUCKET: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  AWS_PROFILE: z.preprocess(emptyStringToUndefined, z.string().optional()),
  NEXT_PUBLIC_APP_NAME: z.string().default("OpenExam")
});

export function readEnv(source: Record<string, unknown> = process.env) {
  return envSchema.parse(source);
}
