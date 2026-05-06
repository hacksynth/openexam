import { AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, resolveAiCredential, resolveTaskAiPreset, type AiTextGenerator } from "./ai";
import { getLearningAnalysis, toStudyPlanSourceStats, type LearningAnalysisState } from "./analysis";
import { formatGoalPath } from "./exam-core";
import { prisma } from "./prisma";
import { studyPlanSchema, type StudyPlan, type StudyPlanTaskStatus } from "./study-plan-schema";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type StudyPlanDatabase = typeof prisma;

type StudyPlanWindow = {
  days: number;
  endDate: Date;
  remainingDays: number;
  startDate: Date;
  targetDate: Date;
};

type StudyPlanOutputValidation = {
  dailyMinutes: number;
  expectedDecisionTaskIds?: string[];
  expectedDays: number;
  targetDate: Date;
  windowEndDate: Date;
  windowStartDate: Date;
};

const studyPlanPromptVersion = "study-plan-generate-v2";
const defaultMaxOutputTokens = 3200;
const maxPlanWindowDays = 30;
const millisecondsPerDay = 86_400_000;
const planTimeZone = "Asia/Shanghai";
const pendingTaskStatus = "pending";
const completedTaskStatus = "completed";
const carriedOverTaskStatus = "carried_over";
const skippedTaskStatus = "skipped";

const taskHrefByKind: Record<StudyPlan["tasks"][number]["kind"], string> = {
  practice: "/practice",
  paper: "/papers",
  wrong_note_review: "/wrong-notes",
  knowledge_review: "/knowledge",
  material_review: "/materials"
};

const studyPlanInclude = {
  goal: {
    include: {
      program: true,
      track: true,
      cycle: true,
      subject: true
    }
  },
  revisions: {
    orderBy: [{ revisionNumber: "desc" }],
    take: 1
  },
  tasks: {
    orderBy: [{ scheduledDate: "asc" }, { day: "asc" }, { createdAt: "asc" }]
  }
} satisfies Prisma.StudyPlanInclude;

type StudyPlanRecord = Prisma.StudyPlanGetPayload<{ include: typeof studyPlanInclude }>;
type StudyPlanTaskRecord = StudyPlanRecord["tasks"][number];

export type StudyPlanView = Awaited<ReturnType<typeof getCurrentStudyPlan>>;

export async function getCurrentStudyPlan(userId: string, db: StudyPlanDatabase = prisma) {
  const goal = await db.examGoal.findFirst({
    where: { userId, isPrimary: true },
    select: { id: true }
  });

  if (!goal) {
    return null;
  }

  const plan = await db.studyPlan.findFirst({
    where: {
      userId,
      goalId: goal.id,
      status: "active"
    },
    include: studyPlanInclude,
    orderBy: [{ generatedAt: "desc" }]
  });

  return plan ? toStudyPlanView(plan) : null;
}

export async function getStudyPlan(userId: string, planId: string, db: StudyPlanDatabase = prisma) {
  const plan = await db.studyPlan.findFirst({
    where: {
      id: planId,
      userId
    },
    include: studyPlanInclude
  });

  return plan ? toStudyPlanView(plan) : null;
}

export async function listStudyPlanHistory(userId: string, db: StudyPlanDatabase = prisma) {
  const goal = await db.examGoal.findFirst({
    where: { userId, isPrimary: true },
    select: { id: true }
  });

  if (!goal) {
    return [];
  }

  const plans = await db.studyPlan.findMany({
    where: {
      userId,
      goalId: goal.id
    },
    include: studyPlanInclude,
    orderBy: [{ generatedAt: "desc" }],
    take: 10
  });

  return plans.map(toStudyPlanView);
}

export async function generateStudyPlan(
  userId: string,
  options: {
    db?: StudyPlanDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
    now?: Date;
  } = {}
): Promise<ActionResult<{ action: "adjusted" | "generated"; aiCallId: string; planId: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const analysis = await getLearningAnalysis(userId, db);

  if (analysis.status === "no_goal") {
    return { ok: false, error: "请先设置考试目标。" };
  }

  const windowResult = buildStudyPlanWindow(analysis.goal.targetDate, now);

  if (!windowResult.ok) {
    return windowResult;
  }

  const presetResult = await resolveStudyPlanPreset(db);

  if (!presetResult.ok) {
    return presetResult;
  }

  const plan = await db.studyPlan.findFirst({
    where: {
      userId,
      goalId: analysis.goal.id,
      status: "active"
    },
    include: studyPlanInclude,
    orderBy: [{ generatedAt: "desc" }]
  });
  const window = windowResult.data;
  const adjustableTasks = plan ? getAdjustableTasks(plan) : [];
  const prompt = buildStudyPlanPrompt(analysis, { adjustableTasks, existingPlan: plan, window });
  const preset = presetResult.data;
  const credential = options.generateText ? null : await resolveAiCredential(userId, preset.provider, db, env);

  if (credential?.ok === false) {
    return credential;
  }

  if (credential?.ok) {
    const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

    if (!usageAllowed.ok) {
      return usageAllowed;
    }
  }

  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model: preset.model,
      taskType: AiTaskType.generate_plan,
      promptVersion: studyPlanPromptVersion,
      inputContextSource: plan ? `goal:${analysis.goal.id};plan:${plan.id}` : `goal:${analysis.goal.id}`,
      tokenEstimate: Math.ceil(prompt.input.length / 4),
      credentialSource: credential?.ok ? credential.data.source : "test",
      status: "running"
    }
  });

  try {
    const result = await (options.generateText ?? generateAiText)({
      provider: preset.provider,
      apiKey: credential?.ok ? credential.data.apiKey : "test-key",
      baseURL: credential?.ok ? credential.data.baseURL : null,
      model: preset.model,
      instructions: prompt.instructions,
      input: prompt.input,
      maxOutputTokens: preset.maxOutputTokens,
      temperature: preset.temperature
    });
    const parsed = parseStudyPlanAiOutput(result.text, {
      dailyMinutes: analysis.goal.dailyMinutes,
      expectedDecisionTaskIds: adjustableTasks.map((task) => task.id),
      expectedDays: window.days,
      targetDate: window.targetDate,
      windowEndDate: window.endDate,
      windowStartDate: window.startDate
    });

    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    if (parsed.data.goalId !== analysis.goal.id) {
      throw new Error("AI 学习计划目标不匹配。");
    }

    const sourceStats = toStudyPlanSourceStats(analysis);
    const generatedAt = new Date(parsed.data.generatedAt);
    const decisionSummary = buildDecisionSummary(plan ? "manual_adjust" : "initial_generate", parsed.data, window);
    const planId = await db.$transaction(async (tx) => {
      if (plan) {
        for (const decision of parsed.data.decisions) {
          await tx.studyPlanTask.updateMany({
            where: {
              id: decision.taskId,
              planId: plan.id,
              status: pendingTaskStatus
            },
            data: {
              status: decision.status
            }
          });
        }

        await tx.studyPlanTask.createMany({
          data: parsed.data.tasks.map((task) => ({
            planId: plan.id,
            ...toStudyPlanTaskCreate(task)
          }))
        });

        await tx.studyPlan.update({
          where: { id: plan.id },
          data: {
            dailyMinutesSnapshot: analysis.goal.dailyMinutes,
            lastAdjustedAt: generatedAt,
            sourceStats: sourceStats as Prisma.InputJsonValue,
            targetDateSnapshot: window.targetDate,
            windowEndDate: window.endDate,
            windowStartDate: window.startDate
          }
        });

        const revisionNumber = await nextStudyPlanRevisionNumber(tx, plan.id);
        await tx.studyPlanRevision.create({
          data: {
            planId: plan.id,
            revisionNumber,
            trigger: "manual_adjust",
            windowStartDate: window.startDate,
            windowEndDate: window.endDate,
            targetDateSnapshot: window.targetDate,
            dailyMinutesSnapshot: analysis.goal.dailyMinutes,
            sourceStats: sourceStats as Prisma.InputJsonValue,
            aiCallId: aiCall.id,
            decisionSummary: decisionSummary as Prisma.InputJsonValue,
            note: buildRevisionNote("manual_adjust", parsed.data, window)
          }
        });

        return plan.id;
      }

      const created = await tx.studyPlan.create({
        data: {
          userId,
          goalId: analysis.goal.id,
          status: "active",
          generatedAt,
          windowStartDate: window.startDate,
          windowEndDate: window.endDate,
          targetDateSnapshot: window.targetDate,
          dailyMinutesSnapshot: analysis.goal.dailyMinutes,
          lastAdjustedAt: generatedAt,
          sourceStats: sourceStats as Prisma.InputJsonValue,
          revisions: {
            create: {
              revisionNumber: 1,
              trigger: "initial_generate",
              windowStartDate: window.startDate,
              windowEndDate: window.endDate,
              targetDateSnapshot: window.targetDate,
              dailyMinutesSnapshot: analysis.goal.dailyMinutes,
              sourceStats: sourceStats as Prisma.InputJsonValue,
              aiCallId: aiCall.id,
              decisionSummary: decisionSummary as Prisma.InputJsonValue,
              note: buildRevisionNote("initial_generate", parsed.data, window)
            }
          },
          tasks: {
            createMany: {
              data: parsed.data.tasks.map(toStudyPlanTaskCreate)
            }
          }
        }
      });

      return created.id;
    });

    await db.aiCall.update({
      where: { id: aiCall.id },
      data: {
        status: "succeeded",
        usage: result.usage ?? undefined,
        errorSummary: null
      }
    });

    return { ok: true, data: { action: plan ? "adjusted" : "generated", planId, aiCallId: aiCall.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "学习计划生成失败。";

    await db.aiCall.update({
      where: { id: aiCall.id },
      data: {
        status: "failed",
        errorSummary: message
      }
    });

    return { ok: false, error: message };
  }
}

export async function setStudyPlanTaskCompleted(userId: string, taskId: string, completed: boolean, db: StudyPlanDatabase = prisma): Promise<ActionResult> {
  const result = await db.studyPlanTask.updateMany({
    where: {
      id: taskId,
      status: {
        in: [pendingTaskStatus, completedTaskStatus]
      },
      plan: {
        userId,
        status: "active"
      }
    },
    data: {
      completedAt: completed ? new Date() : null,
      status: completed ? completedTaskStatus : pendingTaskStatus
    }
  });

  return result.count > 0 ? { ok: true } : { ok: false, error: "计划任务不存在。" };
}

export async function skipStudyPlanTask(userId: string, taskId: string, db: StudyPlanDatabase = prisma): Promise<ActionResult> {
  const result = await db.studyPlanTask.updateMany({
    where: {
      id: taskId,
      status: pendingTaskStatus,
      plan: {
        userId,
        status: "active"
      }
    },
    data: {
      completedAt: null,
      status: skippedTaskStatus
    }
  });

  return result.count > 0 ? { ok: true } : { ok: false, error: "计划任务不存在。" };
}

export async function abandonCurrentStudyPlan(userId: string, db: StudyPlanDatabase = prisma): Promise<ActionResult> {
  const goal = await db.examGoal.findFirst({
    where: { userId, isPrimary: true },
    select: { id: true }
  });

  if (!goal) {
    return { ok: false, error: "当前没有可放弃的学习计划。" };
  }

  const result = await db.studyPlan.updateMany({
    where: {
      userId,
      goalId: goal.id,
      status: "active"
    },
    data: {
      status: "abandoned"
    }
  });

  return result.count > 0 ? { ok: true } : { ok: false, error: "当前没有可放弃的学习计划。" };
}

function toStudyPlanView(plan: StudyPlanRecord) {
  const visibleTasks = plan.tasks.filter((task) => task.status === pendingTaskStatus || task.status === completedTaskStatus);
  const completedCount = visibleTasks.filter((task) => task.status === completedTaskStatus).length;

  return {
    id: plan.id,
    status: plan.status,
    generatedAt: plan.generatedAt,
    windowStartDate: plan.windowStartDate,
    windowEndDate: plan.windowEndDate,
    targetDateSnapshot: plan.targetDateSnapshot,
    dailyMinutesSnapshot: plan.dailyMinutesSnapshot,
    lastAdjustedAt: plan.lastAdjustedAt,
    sourceStats: plan.sourceStats,
    latestRevision: plan.revisions[0] ?? null,
    goalPath: formatGoalPath(plan.goal),
    completedCount,
    taskCount: visibleTasks.length,
    historicalTaskCount: plan.tasks.length - visibleTasks.length,
    tasks: plan.tasks.map((task) => toStudyPlanTaskView(plan, task))
  };
}

export function getStudyPlanAdjustmentReasons(
  analysis: Extract<LearningAnalysisState, { status: "ready" }>,
  plan: NonNullable<StudyPlanView>
) {
  const reasons: string[] = [];
  const sourceStats = readSourceStats(plan.sourceStats);

  if (plan.targetDateSnapshot && analysis.goal.targetDate && dateKey(plan.targetDateSnapshot) !== dateKey(analysis.goal.targetDate)) {
    reasons.push("考试日期已变化");
  }

  if (plan.dailyMinutesSnapshot && plan.dailyMinutesSnapshot !== analysis.goal.dailyMinutes) {
    reasons.push("每日学习时间已变化");
  }

  if (sourceStats) {
    if (analysis.summary.totalQuestions - sourceStats.totalQuestions >= 10) {
      reasons.push("新增作答已达到 10 题");
    }

    if (analysis.summary.pendingWrongNotes - sourceStats.pendingWrongNotes >= 3) {
      reasons.push("未掌握错题明显增加");
    }

    const previousTop3 = sourceStats.weakKnowledgeNodes.slice(0, 3).map((node) => node.id).join(",");
    const currentTop3 = analysis.summary.weakKnowledgeNodes.slice(0, 3).map((node) => node.id).join(",");

    if (previousTop3 !== currentTop3) {
      reasons.push("薄弱知识点排序已变化");
    }
  }

  return reasons;
}

export function buildStudyPlanWindow(targetDate: Date | null | undefined, now = new Date()): ActionResult<StudyPlanWindow> {
  if (!targetDate) {
    return { ok: false, error: "请先在考试目标中保存考试日期。" };
  }

  const startDate = dateFromKey(dateKeyInPlanTimeZone(now));
  const normalizedTargetDate = dateFromKey(dateKeyInPlanTimeZone(targetDate));
  const daysUntilTarget = differenceInDays(startDate, normalizedTargetDate);

  if (daysUntilTarget < 0) {
    return { ok: false, error: "考试日期已过，请更新目标日期。" };
  }

  if (daysUntilTarget === 0) {
    return { ok: false, error: "考试日期是今天，建议直接进入练习或错题复盘。" };
  }

  const remainingDays = daysUntilTarget + 1;
  const days = Math.min(remainingDays, maxPlanWindowDays);

  return {
    ok: true,
    data: {
      days,
      endDate: addDays(startDate, days - 1),
      remainingDays,
      startDate,
      targetDate: normalizedTargetDate
    }
  };
}

export function buildStudyPlanPrompt(
  analysis: Extract<LearningAnalysisState, { status: "ready" }>,
  options?: {
    adjustableTasks?: StudyPlanTaskRecord[];
    existingPlan?: StudyPlanRecord | null;
    window?: StudyPlanWindow;
  }
) {
  const stats = toStudyPlanSourceStats(analysis);
  const windowResult: ActionResult<StudyPlanWindow> = options?.window ? { ok: true, data: options.window } : buildStudyPlanWindow(analysis.goal.targetDate);

  if (!windowResult.ok) {
    throw new Error(windowResult.error);
  }

  const window = windowResult.data;
  const adjustableTasks = options?.adjustableTasks ?? [];
  const isAdjustment = Boolean(options?.existingPlan);
  const expectedJson = {
    goalId: "目标ID",
    generatedAt: "ISO时间",
    days: window.days,
    decisions: isAdjustment ? [{ taskId: "旧任务ID", status: "carried_over", reason: "合并到新的复习任务" }] : [],
    tasks: [
      {
        day: 1,
        scheduledDate: dateKey(window.startDate),
        title: "任务标题",
        kind: "practice",
        minutes: Math.min(45, analysis.goal.dailyMinutes),
        knowledgeNodeIds: ["知识点ID"]
      }
    ]
  };

  return {
    instructions: "你是 OpenExam 的备考计划助手。只输出严格 JSON，不要输出 Markdown。任务必须具体、可执行，并使用简体中文。",
    input: [
      isAdjustment ? "请基于最新学习数据和当前计划，调整今天未完成及未来计划。" : "请基于学习数据生成学习计划。",
      "输出必须符合：",
      JSON.stringify(expectedJson),
      "kind 只能是 practice、paper、wrong_note_review、knowledge_review、material_review。",
      "status 只能用于 decisions，且只能是 carried_over 或 skipped。新 tasks 默认都是 pending。",
      "subjectId、paperId、materialId 是可选字段；没有真实数据库 ID 时必须省略，不要输出“可选”、中文说明或占位符。",
      `计划窗口：${dateKey(window.startDate)} 至 ${dateKey(window.endDate)}，共 ${window.days} 天。`,
      `剩余备考天数：${window.remainingDays} 天；当前只生成最多 ${maxPlanWindowDays} 天的近期计划。`,
      `每日可用时间：${analysis.goal.dailyMinutes} 分钟；每天 1-3 个任务，总分钟数不得超过每日可用时间的 120%。`,
      `考试日期：${dateKey(window.targetDate)}。如果计划覆盖考试当天，当天只安排 wrong_note_review 或 knowledge_review，且总时长不超过 60 分钟。`,
      "每天至少 1 个任务，优先安排薄弱知识点、未掌握错题和适量整卷练习。",
      isAdjustment ? "decisions 必须覆盖下方所有待处理旧任务；用户已完成或已跳过的任务不要恢复。" : "decisions 必须输出空数组。",
      "",
      `目标 ID：${analysis.goal.id}`,
      `当前目标：${stats.goalPath}`,
      `目标分：${analysis.goal.targetScore ?? "未设置"}`,
      `总作答题数：${stats.totalQuestions}`,
      stats.totalQuestions === 0 ? "暂无作答数据：请按考试大纲和目标日期生成基线计划。" : `正确率：${stats.accuracy}%`,
      `得分率：${stats.scoreRate}%`,
      `未掌握错题：${stats.pendingWrongNotes}`,
      `薄弱知识点：${stats.weakKnowledgeNodes.map((node) => `${node.id} ${node.title} 正确率${node.accuracy}% 未掌握错题${node.pendingWrongNotes}`).join(" / ") || "暂无"}`,
      "",
      isAdjustment
        ? `待处理旧任务：${adjustableTasks.map((task) => formatAdjustableTaskForPrompt(task, options?.existingPlan ?? null, window)).join(" / ") || "无"}`
        : "待处理旧任务：无",
      "",
      "要求：generatedAt 使用当前时间 ISO 字符串；goalId 必须等于目标 ID；日期必须在计划窗口内；day 必须从 1 到 days 且与 scheduledDate 对应；每天 1-3 个任务。"
    ].join("\n")
  };
}

export function parseStudyPlanAiOutput(value: string, options?: StudyPlanOutputValidation): ActionResult<StudyPlan> {
  const json = extractJsonObject(value);

  if (!json) {
    return { ok: false, error: "AI 学习计划不是有效 JSON。" };
  }

  try {
    const parsed = studyPlanSchema.safeParse(JSON.parse(json));

    if (!parsed.success) {
      return { ok: false, error: "AI 学习计划格式无效。" };
    }

    if (options) {
      const validation = validateStudyPlanOutput(parsed.data, options);

      if (!validation.ok) {
        return validation;
      }
    }

    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: "AI 学习计划不是有效 JSON。" };
  }
}

async function resolveStudyPlanPreset(db: StudyPlanDatabase) {
  return resolveTaskAiPreset(db, AiTaskType.generate_plan, "json", {
    defaultMaxOutputTokens
  });
}

async function nextStudyPlanRevisionNumber(tx: Prisma.TransactionClient, planId: string) {
  const latest = await tx.studyPlanRevision.findFirst({
    where: { planId },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true }
  });

  return (latest?.revisionNumber ?? 0) + 1;
}

function validateStudyPlanOutput(plan: StudyPlan, options: StudyPlanOutputValidation): ActionResult {
  if (plan.days !== options.expectedDays) {
    return { ok: false, error: "AI 学习计划天数与备考窗口不匹配。" };
  }

  const expectedDecisionIds = new Set(options.expectedDecisionTaskIds ?? []);
  const actualDecisionIds = new Set(plan.decisions.map((decision) => decision.taskId));

  for (const decision of plan.decisions) {
    if (!expectedDecisionIds.has(decision.taskId)) {
      return { ok: false, error: "AI 学习计划包含未知旧任务决策。" };
    }
  }

  for (const taskId of expectedDecisionIds) {
    if (!actualDecisionIds.has(taskId)) {
      return { ok: false, error: "AI 学习计划没有覆盖全部待处理旧任务。" };
    }
  }

  const coveredDays = new Set(plan.tasks.map((task) => task.day));

  if (Array.from({ length: options.expectedDays }, (_, index) => index + 1).some((day) => !coveredDays.has(day))) {
    return { ok: false, error: "AI 学习计划没有覆盖计划窗口内的每一天。" };
  }

  const dailyTasks = new Map<string, StudyPlan["tasks"]>();

  for (const task of plan.tasks) {
    const scheduledDate = dateFromKey(task.scheduledDate);

    if (scheduledDate.getTime() < options.windowStartDate.getTime() || scheduledDate.getTime() > options.windowEndDate.getTime()) {
      return { ok: false, error: "AI 学习计划包含窗口外任务。" };
    }

    const expectedDay = differenceInDays(options.windowStartDate, scheduledDate) + 1;

    if (task.day !== expectedDay) {
      return { ok: false, error: "AI 学习计划日期与天数不匹配。" };
    }

    dailyTasks.set(task.scheduledDate, [...(dailyTasks.get(task.scheduledDate) ?? []), task]);
  }

  const targetDateKey = dateKey(options.targetDate);

  for (const [scheduledDate, tasks] of dailyTasks.entries()) {
    if (tasks.length < 1 || tasks.length > 3) {
      return { ok: false, error: "AI 学习计划每天必须包含 1 到 3 个任务。" };
    }

    const totalMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0);

    if (totalMinutes > Math.ceil(options.dailyMinutes * 1.2)) {
      return { ok: false, error: "AI 学习计划超出每日可用时间。" };
    }

    if (scheduledDate === targetDateKey) {
      if (tasks.some((task) => task.kind !== "wrong_note_review" && task.kind !== "knowledge_review")) {
        return { ok: false, error: "考试当天只能安排轻量复盘任务。" };
      }

      if (totalMinutes > Math.min(60, Math.ceil(options.dailyMinutes * 0.5))) {
        return { ok: false, error: "考试当天复盘时间过长。" };
      }
    }
  }

  return { ok: true };
}

function toStudyPlanTaskCreate(task: StudyPlan["tasks"][number]) {
  return {
    day: task.day,
    scheduledDate: dateFromKey(task.scheduledDate),
    title: task.title,
    kind: task.kind,
    minutes: task.minutes,
    status: pendingTaskStatus,
    subjectId: normalizeOptionalRelationId(task.subjectId),
    knowledgeNodeIds: task.knowledgeNodeIds.filter(isLikelyDatabaseId),
    paperId: normalizeOptionalRelationId(task.paperId),
    materialId: normalizeOptionalRelationId(task.materialId)
  };
}

function toStudyPlanTaskView(plan: StudyPlanRecord, task: StudyPlanTaskRecord) {
  const status = normalizeTaskStatus(task.status, task.completedAt);

  return {
    id: task.id,
    day: task.day,
    scheduledDate: taskDate(task, plan),
    status,
    title: task.title,
    kind: task.kind,
    minutes: task.minutes,
    knowledgeNodeIds: task.knowledgeNodeIds,
    paperId: task.paperId ?? null,
    materialId: task.materialId ?? null,
    subjectId: task.subjectId ?? null,
    completedAt: task.completedAt,
    href: taskHrefByKind[task.kind as keyof typeof taskHrefByKind] ?? "/practice"
  };
}

function getAdjustableTasks(plan: StudyPlanRecord) {
  return plan.tasks.filter((task) => normalizeTaskStatus(task.status, task.completedAt) === pendingTaskStatus);
}

function formatAdjustableTaskForPrompt(task: StudyPlanTaskRecord, plan: StudyPlanRecord | null, window: StudyPlanWindow) {
  const scheduledDate = taskDate(task, plan);
  const timing = scheduledDate.getTime() < window.startDate.getTime() ? "逾期" : "待安排";

  return `${task.id} ${timing} ${dateKey(scheduledDate)} 第${task.day}天 ${task.kind} ${task.minutes}分钟 ${task.title}`;
}

function taskDate(task: Pick<StudyPlanTaskRecord, "day" | "scheduledDate">, plan: Pick<StudyPlanRecord, "generatedAt" | "windowStartDate"> | null) {
  return task.scheduledDate ?? addDays(plan?.windowStartDate ?? plan?.generatedAt ?? new Date(), Math.max(0, task.day - 1));
}

function normalizeTaskStatus(status: string | null | undefined, completedAt: Date | null | undefined): StudyPlanTaskStatus {
  if (status === carriedOverTaskStatus || status === skippedTaskStatus || status === pendingTaskStatus || status === completedTaskStatus) {
    return status;
  }

  return completedAt ? completedTaskStatus : pendingTaskStatus;
}

function normalizeOptionalRelationId(value: string | null | undefined) {
  return value && isLikelyDatabaseId(value) ? value : null;
}

function isLikelyDatabaseId(value: string) {
  return /^c[a-z0-9]{8,}$/i.test(value.trim());
}

function buildDecisionSummary(trigger: "initial_generate" | "manual_adjust", plan: StudyPlan, window: StudyPlanWindow) {
  return {
    trigger,
    windowDays: window.days,
    addedTasks: plan.tasks.length,
    carriedOver: plan.decisions.filter((decision) => decision.status === carriedOverTaskStatus).length,
    skipped: plan.decisions.filter((decision) => decision.status === skippedTaskStatus).length
  };
}

function buildRevisionNote(trigger: "initial_generate" | "manual_adjust", plan: StudyPlan, window: StudyPlanWindow) {
  return trigger === "initial_generate"
    ? `生成 ${window.days} 天学习计划，新增 ${plan.tasks.length} 个任务。`
    : `调整后续 ${window.days} 天计划，处理 ${plan.decisions.length} 个旧任务，新增 ${plan.tasks.length} 个任务。`;
}

function readSourceStats(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const totalQuestions = Number(value.totalQuestions ?? 0);
  const pendingWrongNotes = Number(value.pendingWrongNotes ?? 0);
  const weakKnowledgeNodes = Array.isArray(value.weakKnowledgeNodes)
    ? value.weakKnowledgeNodes
        .map((node) => {
          if (!node || typeof node !== "object" || Array.isArray(node)) {
            return null;
          }

          return {
            id: String(node.id ?? ""),
            title: String(node.title ?? "")
          };
        })
        .filter((node): node is { id: string; title: string } => Boolean(node?.id))
    : [];

  return {
    totalQuestions,
    pendingWrongNotes,
    weakKnowledgeNodes
  };
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateKeyInPlanTimeZone(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: planTimeZone,
    year: "numeric"
  })
    .formatToParts(value)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }

      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: Date, days: number) {
  const next = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function differenceInDays(startDate: Date, endDate: Date) {
  return Math.round((dateFromKey(dateKey(endDate)).getTime() - dateFromKey(dateKey(startDate)).getTime()) / millisecondsPerDay);
}
