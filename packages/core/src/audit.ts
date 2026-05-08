import { Prisma } from "@prisma/client";
import { buildPagination, type PaginationInput } from "./pagination";
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
  page?: string | number | null;
  pageSize?: string | number | null;
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
  const where = {
    ...(filters.actorId?.trim() ? { actorId: filters.actorId.trim() } : {}),
    ...(filters.action?.trim() ? { action: { contains: filters.action.trim(), mode: "insensitive" } } : {}),
    ...(filters.entityType?.trim() ? { entityType: filters.entityType.trim() } : {}),
    ...(filters.entityId?.trim() ? { entityId: filters.entityId.trim() } : {})
  } satisfies Prisma.AuditLogWhereInput;
  const totalItems = await db.auditLog.count({ where });
  const pagination = buildPagination(filters, totalItems);
  const logs = await db.auditLog.findMany({
    where,
    include: {
      actor: true
    },
    orderBy: [{ createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take
  });

  return {
    pagination,
    items: logs.map((log) => ({
      id: log.id,
      actorEmail: log.actor?.email ?? null,
      actorName: log.actor?.name ?? null,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt
    }))
  };
}
