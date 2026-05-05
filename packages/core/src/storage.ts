import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fromIni } from "@aws-sdk/credential-providers";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readEnv } from "./env";

export type StorageBytes = Buffer;

export const defaultStorageDriver: StorageEnv["STORAGE_DRIVER"] = "local";

type StorageEnv = ReturnType<typeof readEnv>;

type ReadableStorageResponse = {
  data: StorageBytes;
  contentType?: string;
};

type WriteStorageInput = {
  storageKey: string;
  bytes: StorageBytes;
  source?: NodeJS.ProcessEnv;
};

export function resolveLocalStoragePath(storageKey: string, source: NodeJS.ProcessEnv | StorageEnv = process.env) {
  const env = readEnv({
    ...source,
    DATABASE_URL: source.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public"
  });
  const root = resolveLocalStorageRoot(env.LOCAL_STORAGE_DIR);
  const normalizedKey = normalizeStorageKey(storageKey);
  const filePath = path.resolve(/*turbopackIgnore: true*/ root, normalizedKey);
  const normalizedRoot = path.resolve(/*turbopackIgnore: true*/ root);

  if (filePath !== normalizedRoot && !filePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error("存储路径无效。");
  }

  return filePath;
}

export function resolveLocalStorageRoot(value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  const cwd = /*turbopackIgnore: true*/ process.cwd();

  if (path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(/*turbopackIgnore: true*/ cwd, "../..", value);
  }

  return path.resolve(/*turbopackIgnore: true*/ cwd, value);
}

export async function readStorageBytes(storageKey: string, source: NodeJS.ProcessEnv = process.env): Promise<StorageBytes> {
  const env = readEnv({
    ...source,
    DATABASE_URL: source.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public"
  });

  if (env.STORAGE_DRIVER === "local") {
    return readFile(resolveLocalStoragePath(storageKey, env));
  }

  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET 未配置。请配置 STORAGE_DRIVER=s3 后的 bucket。");
  }

  const client = createS3Client(env);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: normalizeStorageKey(storageKey)
    })
  );
  const stream = response.Body;

  if (!stream || !("transformToByteArray" in stream)) {
    throw new Error("S3 返回无效文件内容。");
  }

  const bytes = await stream.transformToByteArray();

  return Buffer.from(bytes);
}

export async function writeStorageBytes(input: StorageBytes | WriteStorageInput, maybeSource?: NodeJS.ProcessEnv) {
  if (Buffer.isBuffer(input)) {
    throw new Error("writeStorageBytes 需以对象形式调用。请升级调用方。");
  }

  const { storageKey, bytes, source = maybeSource } = input;
  const env = readEnv({
    ...source,
    DATABASE_URL: source?.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public"
  });

  if (env.STORAGE_DRIVER === "local") {
    const storagePath = resolveLocalStoragePath(storageKey, env);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, bytes);
    return { storageKey } as const;
  }

  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET 未配置。请配置 STORAGE_DRIVER=s3 后的 bucket。");
  }

  const client = createS3Client(env);

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: normalizeStorageKey(storageKey),
      Body: bytes
    })
  );

  return { storageKey } as const;
}

function createS3Client(env: StorageEnv) {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY
          }
        : fromIni({
            profile: env.AWS_PROFILE?.trim() || undefined,
            clientConfig: {
              region: env.S3_REGION
            }
          })
  });
}

function normalizeStorageKey(value: string) {
  const withoutLeadingSlash = value.replace(/^[/\\]+/, "");
  const normalized = path.normalize(withoutLeadingSlash);

  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new Error("存储路径无效。");
  }

  return normalized;
}
