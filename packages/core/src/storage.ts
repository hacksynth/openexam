import path from "node:path";
import { readEnv } from "./env";

export function resolveLocalStoragePath(storageKey: string, source: NodeJS.ProcessEnv = process.env) {
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

function normalizeStorageKey(value: string) {
  const withoutLeadingSlash = value.replace(/^[/\\]+/, "");
  const normalized = path.normalize(withoutLeadingSlash);

  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new Error("存储路径无效。");
  }

  return normalized;
}
