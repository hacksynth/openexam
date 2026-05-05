import { AiProvider, AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateOpenAiText, resolveOpenAiCredential, type AiTextGenerator } from "./ai";
import { getLearningAnalysis, toStudyPlanSourceStats, type LearningAnalysisState } from "./analysis";
import { formatGoalPath } from "./exam-core";
import { prisma } from "./prisma";
import { studyPlanSchema, type StudyPlan } from "./study-plan-schema";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type StudyPlanDatabase = typeof prisma;

const studyPlanPromptVersion = "study-plan-generate-v1";
const defaultOpenAiModel = "gpt-5.5";
const defaultMaxOutputTokens = 1800;

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
  tasks: {
    orderBy: [{ day: "asc" }, { createdAt: "asc" }]
  }
} satisfies Prisma.StudyPlanInclude;

type StudyPlanRecord = Prisma.StudyPlanGetPayload<{ include: typeof studyPlanInclude }>;

export type StudyPlanView = Awaited<ReturnType<typeof getCurrentStudyPlan>>;

export async function getCurrentStudyPlan(userId: string, db: StudyPlanDatabase = prisma) {
  const plan = await db.studyPlan.findFirst({
    where: {
      userId,
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
  const plans = await db.studyPlan.findMany({
    where: {
      userId
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
  } = {}
): Promise<ActionResult<{ planId: string; aiCallId: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const analysis = await getLearningAnalysis(userId, db);

  if (analysis.status === "no_goal") {
    return { ok: false, error: "请先设置考试目标。" };
  }

  const preset = await resolveStudyPlanPreset(db);
  const prompt = buildStudyPlanPrompt(analysis);
  const credential = options.generateText ? null : await resolveOpenAiCredential(userId, db, env);

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
      provider: AiProvider.openai,
      model: preset.model,
      taskType: AiTaskType.generate_plan,
      promptVersion: studyPlanPromptVersion,
      inputContextSource: `goal:${analysis.goal.id}`,
      tokenEstimate: Math.ceil(prompt.input.length / 4),
      credentialSource: credential?.ok ? credential.data.source : "test",
      status: "running"
    }
  });

  try {
    const result = await (options.generateText ?? generateOpenAiText)({
      apiKey: credential?.ok ? credential.data.apiKey : "test-key",
      baseURL: credential?.ok ? credential.data.baseURL : env.OPENAI_BASE_URL?.trim() || null,
      model: preset.model,
      instructions: prompt.instructions,
      input: prompt.input,
      maxOutputTokens: preset.maxOutputTokens,
      temperature: preset.temperature
    });
    const parsed = parseStudyPlanAiOutput(result.text);

    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    if (parsed.data.goalId !== analysis.goal.id) {
      throw new Error("AI 学习计划目标不匹配。");
    }

    if (parsed.data.tasks.length < 14) {
      throw new Error("AI 学习计划至少需要 14 个任务。");
    }

    const sourceStats = toStudyPlanSourceStats(analysis);
    const planId = await db.$transaction(async (tx) => {
      await tx.studyPlan.updateMany({
        where: {
          userId,
          status: "active"
        },
        data: {
          status: "archived"
        }
      });

      const plan = await tx.studyPlan.create({
        data: {
          userId,
          goalId: analysis.goal.id,
          status: "active",
          generatedAt: new Date(parsed.data.generatedAt),
          sourceStats: sourceStats as Prisma.InputJsonValue,
          tasks: {
            createMany: {
              data: parsed.data.tasks.map((task) => ({
                day: task.day,
                title: task.title,
                kind: task.kind,
                minutes: task.minutes,
                subjectId: task.subjectId ?? null,
                knowledgeNodeIds: task.knowledgeNodeIds,
                paperId: task.paperId ?? null,
                materialId: task.materialId ?? null
              }))
            }
          }
        }
      });

      return plan.id;
    });

    await db.aiCall.update({
      where: { id: aiCall.id },
      data: {
        status: "succeeded",
        usage: result.usage ?? undefined,
        errorSummary: null
      }
    });

    return { ok: true, data: { planId, aiCallId: aiCall.id } };
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
      plan: {
        userId,
        status: "active"
      }
    },
    data: {
      completedAt: completed ? new Date() : null
    }
  });

  return result.count > 0 ? { ok: true } : { ok: false, error: "计划任务不存在。" };
}

export async function abandonCurrentStudyPlan(userId: string, db: StudyPlanDatabase = prisma): Promise<ActionResult> {
  const result = await db.studyPlan.updateMany({
    where: {
      userId,
      status: "active"
    },
    data: {
      status: "abandoned"
    }
  });

  return result.count > 0 ? { ok: true } : { ok: false, error: "当前没有可放弃的学习计划。" };
}

function toStudyPlanView(plan: StudyPlanRecord) {
  return {
    id: plan.id,
    status: plan.status,
    generatedAt: plan.generatedAt,
    goalPath: formatGoalPath(plan.goal),
    completedCount: plan.tasks.filter((task) => task.completedAt).length,
    taskCount: plan.tasks.length,
    tasks: plan.tasks.map((task) => ({
      id: task.id,
      day: task.day,
      title: task.title,
      kind: task.kind,
      minutes: task.minutes,
      knowledgeNodeIds: task.knowledgeNodeIds,
      paperId: task.paperId ?? null,
      materialId: task.materialId ?? null,
      subjectId: task.subjectId ?? null,
      completedAt: task.completedAt,
      href: taskHrefByKind[task.kind as keyof typeof taskHrefByKind] ?? "/practice"
    }))
  };
}

export function buildStudyPlanPrompt(analysis: Extract<LearningAnalysisState, { status: "ready" }>) {
  const stats = toStudyPlanSourceStats(analysis);

  return {
    instructions: "你是 OpenExam 的备考计划助手。只输出严格 JSON，不要输出 Markdown。任务必须具体、可执行，并使用简体中文。",
    input: [
      "请基于学习数据生成 14 天学习计划，输出必须符合：",
      '{"goalId":"目标ID","generatedAt":"ISO时间","days":14,"tasks":[{"day":1,"title":"任务标题","kind":"practice","minutes":45,"subjectId":"可选","knowledgeNodeIds":["可选知识点ID"],"paperId":"可选","materialId":"可选"}]}',
      "kind 只能是 practice、paper、wrong_note_review、knowledge_review、material_review。",
      "每天至少 1 个任务，优先安排薄弱知识点、未掌握错题和适量整卷练习。",
      "",
      `目标 ID：${analysis.goal.id}`,
      `当前目标：${stats.goalPath}`,
      `每日可用时间：${analysis.goal.dailyMinutes} 分钟`,
      `目标日期：${analysis.goal.targetDate?.toISOString().slice(0, 10) ?? "未设置"}`,
      `目标分：${analysis.goal.targetScore ?? "未设置"}`,
      `总作答题数：${stats.totalQuestions}`,
      `正确率：${stats.accuracy}%`,
      `得分率：${stats.scoreRate}%`,
      `未掌握错题：${stats.pendingWrongNotes}`,
      `薄弱知识点：${stats.weakKnowledgeNodes.map((node) => `${node.id} ${node.title} 正确率${node.accuracy}% 未掌握错题${node.pendingWrongNotes}`).join(" / ") || "暂无"}`,
      "",
      "要求：generatedAt 使用当前时间 ISO 字符串；goalId 必须等于目标 ID；总任务不少于 14 个。"
    ].join("\n")
  };
}

export function parseStudyPlanAiOutput(value: string): ActionResult<StudyPlan> {
  const json = extractJsonObject(value);

  if (!json) {
    return { ok: false, error: "AI 学习计划不是有效 JSON。" };
  }

  try {
    const parsed = studyPlanSchema.safeParse(JSON.parse(json));

    if (!parsed.success) {
      return { ok: false, error: "AI 学习计划格式无效。" };
    }

    const coveredDays = new Set(parsed.data.tasks.map((task) => task.day));

    if (Array.from({ length: 14 }, (_, index) => index + 1).some((day) => !coveredDays.has(day))) {
      return { ok: false, error: "AI 学习计划需要覆盖 14 天。" };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: "AI 学习计划不是有效 JSON。" };
  }
}

async function resolveStudyPlanPreset(db: StudyPlanDatabase) {
  const preset = await db.aiProviderPreset.findFirst({
    where: {
      provider: AiProvider.openai,
      defaultForTask: AiTaskType.generate_plan,
      enabled: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    model: preset?.model ?? defaultOpenAiModel,
    maxOutputTokens: preset?.maxTokens ?? defaultMaxOutputTokens,
    temperature: preset?.temperature ?? null
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
