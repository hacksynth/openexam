import { readTotalTokens } from "./ai";
import { buildPagination, type PaginationInput } from "./pagination";
import { prisma } from "./prisma";

type UserDatabase = typeof prisma;

export async function listAdminUsersWithAiUsage(options: PaginationInput = {}, db: UserDatabase = prisma) {
  const totalItems = await db.user.count();
  const pagination = buildPagination(options, totalItems);
  const users = await db.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take
  });
  const userIds = users.map((user) => user.id);
  const calls = userIds.length
    ? await db.aiCall.findMany({
        where: {
          userId: {
            in: userIds
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 1000
      })
    : [];
  const usage = new Map<
    string,
    {
      total: number;
      failed: number;
      byok: number;
      platform: number;
      tokens: number;
      lastCalledAt: Date | null;
    }
  >();

  for (const user of users) {
    usage.set(user.id, {
      total: 0,
      failed: 0,
      byok: 0,
      platform: 0,
      tokens: 0,
      lastCalledAt: null
    });
  }

  for (const call of calls) {
    if (!call.userId) {
      continue;
    }

    const current = usage.get(call.userId);

    if (!current) {
      continue;
    }

    current.total += 1;
    current.failed += call.status === "failed" ? 1 : 0;
    current.byok += call.credentialSource === "byok" ? 1 : 0;
    current.platform += call.credentialSource === "platform" ? 1 : 0;
    current.tokens += readTotalTokens(call.usage);
    current.lastCalledAt = current.lastCalledAt && current.lastCalledAt > call.createdAt ? current.lastCalledAt : call.createdAt;
  }

  return {
    pagination,
    items: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      usage: usage.get(user.id)!
    }))
  };
}
