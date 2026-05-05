import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type AuditDatabase = typeof prisma;

export type AuditLogInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type AuditLogFilters = {
  actorId?: string | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export async function writeAuditLog(input: AuditLogInput, db: AuditDatabase = prisma) {
  return db.auditLog.create({
    data: {
      actorId: input.actorId?.trim() || null,
      action: input.action.trim(),
      entityType: input.entityType.trim(),
      entityId: input.entityId?.trim() || null,
      metadata: input.metadata ?? undefined
    }
  });
}

export async function listAuditLogs(filters: AuditLogFilters = {}, db: AuditDatabase = prisma) {
  const logs = await db.auditLog.findMany({
    where: {
      ...(filters.actorId?.trim() ? { actorId: filters.actorId.trim() } : {}),
      ...(filters.action?.trim() ? { action: { contains: filters.action.trim(), mode: "insensitive" } } : {}),
      ...(filters.entityType?.trim() ? { entityType: filters.entityType.trim() } : {}),
      ...(filters.entityId?.trim() ? { entityId: filters.entityId.trim() } : {})
    },
    include: {
      actor: true
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100
  });

  return logs.map((log) => ({
    id: log.id,
    actorEmail: log.actor?.email ?? null,
    actorName: log.actor?.name ?? null,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    metadata: log.metadata,
    createdAt: log.createdAt
  }));
}
