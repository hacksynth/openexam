import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_URL: z.string().url().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  NEXT_PUBLIC_APP_NAME: z.string().default("OpenExam")
});

export function readEnv(source = process.env) {
  return envSchema.parse(source);
}
