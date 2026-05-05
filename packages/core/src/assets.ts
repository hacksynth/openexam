import { readFile } from "node:fs/promises";
import { Visibility } from "@prisma/client";
import { prisma } from "./prisma";
import { resolveLocalStoragePath } from "./storage";

type AssetDatabase = typeof prisma;

type AssetAccess = {
  userId?: string | null;
  isAdmin?: boolean;
};

export type ReadableAsset = {
  id: string;
  ownerId: string | null;
  visibility: Visibility;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

export async function findReadableAsset(assetId: string, access: AssetAccess, db: AssetDatabase = prisma) {
  const normalizedId = assetId.trim();

  if (!normalizedId) {
    return { ok: false, status: 404, error: "资源不存在。" } as const;
  }

  const asset = await db.asset.findUnique({
    where: { id: normalizedId },
    select: {
      id: true,
      ownerId: true,
      visibility: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true
    }
  });

  if (!asset) {
    return { ok: false, status: 404, error: "资源不存在。" } as const;
  }

  if (!canReadAsset(asset, access)) {
    return { ok: false, status: 403, error: "无权访问该资源。" } as const;
  }

  return { ok: true, data: asset } as const;
}

export async function readAssetBytes(asset: Pick<ReadableAsset, "storageKey">, source: NodeJS.ProcessEnv = process.env) {
  return readFile(resolveLocalStoragePath(asset.storageKey, source));
}

export function canReadAsset(asset: Pick<ReadableAsset, "ownerId" | "visibility">, access: AssetAccess) {
  if (access.isAdmin) {
    return true;
  }

  if (asset.visibility === Visibility.private) {
    return Boolean(access.userId && asset.ownerId === access.userId);
  }

  return Boolean(access.userId);
}
