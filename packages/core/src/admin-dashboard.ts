import { prisma } from "./prisma";

export async function getAdminDashboardMetrics(db = prisma) {
  const dayStart = new Date();

  dayStart.setHours(0, 0, 0, 0);

  const [pendingQuestions, failedJobs, todayAiCalls, auditEvents] = await Promise.all([
    db.question.count({
      where: {
        deletedAt: null,
        reviewStatus: "pending_review"
      }
    }),
    db.job.count({
      where: {
        status: "failed"
      }
    }),
    db.aiCall.count({
      where: {
        createdAt: {
          gte: dayStart
        }
      }
    }),
    db.auditLog.count({
      where: {
        createdAt: {
          gte: dayStart
        }
      }
    })
  ]);

  return {
    pendingQuestions,
    failedJobs,
    todayAiCalls,
    auditEvents
  };
}
