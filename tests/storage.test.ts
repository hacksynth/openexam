import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalStorageRoot, writeStorageBytes } from "@openexam/core/storage";

const originalCwd = process.cwd();
const tempDirs: string[] = [];

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("local storage path resolution", () => {
  it("resolves from a workspace app directory to the workspace root", async () => {
    const root = await makeTempDir();
    const appDir = path.join(root, "apps", "web");

    await mkdir(appDir, { recursive: true });
    process.chdir(appDir);

    expect(resolveLocalStorageRoot("./storage")).toBe(path.join(root, "storage"));
  });

  it("resolves from a Next standalone app directory to the workspace root", async () => {
    const root = await makeTempDir();
    const standaloneAppDir = path.join(root, "apps", "web", ".next", "standalone", "apps", "web");

    await mkdir(standaloneAppDir, { recursive: true });
    process.chdir(standaloneAppDir);

    expect(resolveLocalStorageRoot("./storage")).toBe(path.join(root, "storage"));
  });

  it("keeps absolute storage paths unchanged", () => {
    const storagePath = path.join(path.parse(originalCwd).root, "app", "storage");

    expect(resolveLocalStorageRoot(storagePath)).toBe(storagePath);
  });

  it("uses process env storage settings when write source is omitted", async () => {
    const originalStorageDir = process.env.LOCAL_STORAGE_DIR;
    const root = await makeTempDir();
    const storageKey = "materials/user_1/default-source.txt";

    process.env.LOCAL_STORAGE_DIR = root;

    try {
      await writeStorageBytes({ storageKey, bytes: Buffer.from("default-source") });

      await expect(readFile(path.join(root, storageKey), "utf8")).resolves.toBe("default-source");
    } finally {
      if (originalStorageDir === undefined) {
        delete process.env.LOCAL_STORAGE_DIR;
      } else {
        process.env.LOCAL_STORAGE_DIR = originalStorageDir;
      }
    }
  });
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "openexam-storage-"));

  tempDirs.push(dir);
  return dir;
}
