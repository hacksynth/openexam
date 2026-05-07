import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { summarizeConsolidationNotes, summarizeWrongNotes } from "./practice";

type DashboardDatabase = typeof prisma;

const dashboardPlanInclude = {
  tasks: {
    orderBy: [{ scheduledDate: "asc" }, { day: "asc" }, { createdAt: "asc" }]
  }
} satisfies Prisma.StudyPlanInclude;

const dashboardAttemptInclude = {
  paper: true
} satisfies Prisma.AttemptInclude;

type DashboardPlan = Prisma.StudyPlanGetPayload<{ include: typeof dashboardPlanInclude }>;
type DashboardPaperAttempt = Prisma.AttemptGetPayload<{ include: typeof dashboardAttemptInclude }>;

export type LearnerDashboard = Awaited<ReturnType<typeof getLearnerDashboard>>;

export async function getLearnerDashboard(userId: string, db: DashboardDatabase = prisma, now = new Date()) {
  const goal = await db.examGoal.findFirst({
    where: { userId, isPrimary: true },
    select: { id: true }
  });
  const [wrongNotes, consolidationNotes, plan, jobs, aiCalls, paperAttempts] = await Promise.all([
    db.wrongNote.findMany({
      where: {
        userId,
        mastered: false,
        errorCount: {
          gt: 0
        }
      },
      include: {
        question: {
          include: {
            knowledgeBindings: {
              include: {
                knowledgeNode: true
              }
            }
          }
        }
      }
    }),
    db.consolidationNote.findMany({
      where: {
        userId,
        mastered: false
      },
      include: {
        question: {
          include: {
            knowledgeBindings: {
              include: {
                knowledgeNode: true
              }
            }
          }
        }
      }
    }),
    db.studyPlan.findFirst({
      where: {
        userId,
        goalId: goal?.id ?? "__no_active_goal__",
        status: "active"
      },
      include: dashboardPlanInclude,
      orderBy: [{ generatedAt: "desc" }]
    }),
    db.job.findMany({
      where: {
        userId
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5
    }),
    db.aiCall.findMany({
      where: {
        userId
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5
    }),
    db.attempt.findMany({
      where: {
        userId,
        paperId: {
          not: null
        },
        status: {
          in: ["in_progress", "paused"]
        }
      },
      include: dashboardAttemptInclude,
      orderBy: [{ updatedAt: "desc" }],
      take: 3
    })
  ]);
  const practiceSummary = summarizeWrongNotes(
    wrongNotes.map((note) => ({
      mastered: note.mastered,
      knowledgeNodes: note.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
    }))
  );
  const consolidationSummary = summarizeConsolidationNotes(
    consolidationNotes.map((note) => ({
      mastered: note.mastered,
      knowledgeNodes: note.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
    }))
  );
  const weakKnowledgeNodes = combineRiskKnowledgeNodes(practiceSummary.weakKnowledgeNodes, consolidationSummary.weakKnowledgeNodes);
  const planTasks = getTodayPlanTasks(plan, now).map((task) => ({
    id: task.id,
    label: task.title,
    href: taskHrefByKind(task.kind)
  }));
  const derivedTasks = planTasks.length > 0 ? [] : buildDerivedTasks(practiceSummary, consolidationSummary, paperAttempts);
  const todayTasks = planTasks.length > 0 ? planTasks : derivedTasks;
  const recentJobs = [...jobs.map(toJobActivity), ...aiCalls.map(toAiActivity)]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, 5);
  const activeAiTaskCount = recentJobs.filter((job) => job.status === "queued" || job.status === "running").length;

  return {
    metrics: [
      { label: "今日任务", value: String(todayTasks.length) },
      { label: "待复习错题", value: String(practiceSummary.pendingWrongNotes) },
      { label: "待巩固", value: String(consolidationSummary.pendingConsolidationNotes) },
      { label: "薄弱知识点", value: String(weakKnowledgeNodes.length) },
      { label: "AI 任务", value: String(activeAiTaskCount) }
    ],
    todayTasks,
    weakKnowledgeNodes,
    recentJobs
  };
}

function getTodayPlanTasks(plan: DashboardPlan | null, now: Date) {
  if (!plan) {
    return [];
  }

  const today = dateKey(startOfLocalDay(now));

  return plan.tasks.filter((task) => {
    const status = task.status || (task.completedAt ? "completed" : "pending");
    const scheduledDate = task.scheduledDate ?? new Date(startOfLocalDay(plan.generatedAt).getTime() + Math.max(0, task.day - 1) * 86_400_000);

    return status === "pending" && dateKey(startOfLocalDay(scheduledDate)) === today;
  });
}

function buildDerivedTasks(
  practiceSummary: ReturnType<typeof summarizeWrongNotes>,
  consolidationSummary: ReturnType<typeof summarizeConsolidationNotes>,
  paperAttempts: DashboardPaperAttempt[]
) {
  const tasks: { id: string; label: string; href: string }[] = [];

  if (practiceSummary.pendingWrongNotes > 0) {
    tasks.push({
      id: "wrong-notes",
      label: `复习 ${practiceSummary.pendingWrongNotes} 道未掌握错题`,
      href: "/wrong-notes"
    });
  }

  if (consolidationSummary.pendingConsolidationNotes > 0) {
    tasks.push({
      id: "consolidation",
      label: `巩固 ${consolidationSummary.pendingConsolidationNotes} 道正确未掌握题`,
      href: "/consolidation"
    });
  }

  const weakestNode = practiceSummary.weakKnowledgeNodes[0];

  if (weakestNode) {
    tasks.push({
      id: "weak-node",
      label: `针对 ${weakestNode.title} 做一次专项练习`,
      href: "/practice"
    });
  }

  const paperAttempt = paperAttempts[0];

  if (paperAttempt) {
    tasks.push({
      id: `paper-${paperAttempt.id}`,
      label: `继续未完成试卷：${paperAttempt.paper?.title ?? "未命名试卷"}`,
      href: paperAttempt.paperId ? `/papers/${paperAttempt.paperId}` : "/papers"
    });
  }

  return tasks.slice(0, 5);
}

function toJobActivity(job: Awaited<ReturnType<DashboardDatabase["job"]["findMany"]>>[number]) {
  return {
    id: job.id,
    label: jobTypeLabel(job.type),
    status: job.status,
    statusLabel: statusLabel(job.status),
    updatedAt: job.updatedAt
  };
}

function toAiActivity(call: Awaited<ReturnType<DashboardDatabase["aiCall"]["findMany"]>>[number]) {
  return {
    id: call.id,
    label: aiTaskLabel(call.taskType),
    status: call.status,
    statusLabel: statusLabel(call.status),
    updatedAt: call.updatedAt
  };
}

function taskHrefByKind(kind: string) {
  return (
    {
      practice: "/practice",
      paper: "/papers",
      wrong_note_review: "/wrong-notes",
      consolidation_review: "/consolidation",
      knowledge_review: "/knowledge",
      material_review: "/materials"
    }[kind] ?? "/practice"
  );
}

function combineRiskKnowledgeNodes(
  wrongNodes: ReturnType<typeof summarizeWrongNotes>["weakKnowledgeNodes"],
  consolidationNodes: ReturnType<typeof summarizeConsolidationNotes>["weakKnowledgeNodes"]
) {
  const counts = new Map<string, { title: string; count: number; wrongCount: number; consolidationCount: number }>();

  for (const node of wrongNodes) {
    const current = counts.get(node.title) ?? { title: node.title, count: 0, wrongCount: 0, consolidationCount: 0 };
    current.count += node.count;
    current.wrongCount += node.count;
    counts.set(node.title, current);
  }

  for (const node of consolidationNodes) {
    const current = counts.get(node.title) ?? { title: node.title, count: 0, wrongCount: 0, consolidationCount: 0 };
    current.count += node.count;
    current.consolidationCount += node.count;
    counts.set(node.title, current);
  }

  return [...counts.values()]
    .sort((left, right) => right.wrongCount - left.wrongCount || right.consolidationCount - left.consolidationCount || left.title.localeCompare(right.title, "zh-CN"))
    .slice(0, 5);
}

function jobTypeLabel(type: string) {
  return (
    {
      extract_material_questions: "资料题目抽取",
      generate_wrong_note_review_card: "错题复习卡"
    }[type] ?? type
  );
}

function aiTaskLabel(type: string) {
  return (
    {
      explain_question: "错题 AI 解析",
      grade_subjective: "主观题评分",
      generate_plan: "学习计划生成",
      extract_questions: "资料题目抽取",
      generate_practice_questions: "AI 练习题生成",
      diagnose_learning: "学习诊断",
      generate_wrong_note_image_prompt: "图片 Prompt",
      generate_image: "图片生成",
      chat_with_context: "上下文对话"
    }[type] ?? type
  );
}

function statusLabel(status: string) {
  return (
    {
      queued: "排队中",
      running: "运行中",
      succeeded: "已完成",
      failed: "失败",
      canceled: "已取消"
    }[status] ?? status
  );
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
