import { AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, resolveAiCredential, resolveTaskAiPreset, type AiTextGenerator } from "./ai";
import { parseLearningDiagnosisOutput } from "./ai-output-schemas";
import { getLearningAnalysis, toStudyPlanSourceStats, type LearningAnalysisState } from "./analysis";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type DiagnosisDatabase = typeof prisma;

const promptVersion = "learning-diagnosis-v2";
const defaultMaxOutputTokens = 1200;

export async function getLatestLearningDiagnosis(userId: string, db: DiagnosisDatabase = prisma) {
  const analysis = await getLearningAnalysis(userId, db);

  if (analysis.status === "no_goal") {
    return null;
  }

  const diagnosis = await db.learningDiagnosis.findFirst({
    where: {
      userId,
      goalId: analysis.goal.id
    },
    orderBy: [{ createdAt: "desc" }]
  });

  return diagnosis
    ? {
        id: diagnosis.id,
        goalId: diagnosis.goalId,
        goalPath: diagnosis.goalPath,
        summary: diagnosis.summary,
        weakKnowledgeNodeIds: diagnosis.weakKnowledgeNodeIds,
        recommendations: diagnosis.recommendations,
        aiCallId: diagnosis.aiCallId,
        createdAt: diagnosis.createdAt
      }
    : null;
}

export async function generateLearningDiagnosis(
  userId: string,
  options: {
    db?: DiagnosisDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ diagnosisId: string; aiCallId: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const analysis = await getLearningAnalysis(userId, db);

  if (analysis.status === "no_goal") {
    return { ok: false, error: "请先设置考试目标。" };
  }

  const presetResult = await resolveDiagnosisPreset(db);

  if (!presetResult.ok) {
    return presetResult;
  }

  const preset = presetResult.data;
  const prompt = buildLearningDiagnosisPrompt(analysis);
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
      taskType: AiTaskType.diagnose_learning,
      promptVersion,
      inputContextSource: `goal:${analysis.goal.id}`,
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
      apiMode: credential?.ok ? credential.data.apiMode : null,
      model: preset.model,
      instructions: prompt.instructions,
      input: prompt.input,
      maxOutputTokens: preset.maxOutputTokens,
      temperature: preset.temperature
    });
    const parsed = parseLearningDiagnosisOutput(result.text);

    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const sourceStats = toStudyPlanSourceStats(analysis);
    const diagnosis = await db.$transaction(async (tx) => {
      const created = await tx.learningDiagnosis.create({
        data: {
          userId,
          goalId: analysis.goal.id,
          goalPath: analysis.goalPath,
          summary: parsed.data.summary,
          weakKnowledgeNodeIds: parsed.data.weakKnowledgeNodeIds,
          recommendations: parsed.data.recommendations,
          sourceStats: sourceStats as Prisma.InputJsonValue,
          aiCallId: aiCall.id
        }
      });

      await tx.aiCall.update({
        where: { id: aiCall.id },
        data: {
          status: "succeeded",
          usage: result.usage ?? undefined,
          errorSummary: null
        }
      });

      return created;
    });

    return { ok: true, data: { diagnosisId: diagnosis.id, aiCallId: aiCall.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "学习诊断生成失败。";

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

export function buildLearningDiagnosisPrompt(analysis: Extract<LearningAnalysisState, { status: "ready" }>) {
  const stats = analysis.summary;

  return {
    instructions: "你是 OpenExam 的学习诊断助手。必须输出严格 JSON，不要输出 Markdown。所有文字使用简体中文。",
    input: [
      "请基于当前考试目标、作答统计、错题和薄弱知识点生成学习诊断。",
      "输出 JSON：",
      '{"summary":"100-240 字诊断总结","weakKnowledgeNodeIds":["知识点ID"],"recommendations":["行动建议1","行动建议2","行动建议3"]}',
      "",
      `目标：${analysis.goalPath}`,
      `作答题数：${stats.totalQuestions}`,
      `正确率：${stats.accuracy}%`,
      `得分率：${stats.scoreRate}%`,
      `错误题数：${stats.wrongCount}`,
      `未作答题数：${stats.unansweredCount}`,
      `未掌握错题：${stats.pendingWrongNotes}`,
      `已掌握错题：${stats.masteredWrongNotes}`,
      `待巩固题：${stats.pendingConsolidationNotes}`,
      `掌握风险：${stats.masteryRiskCount}`,
      "薄弱知识点：",
      stats.weakKnowledgeNodes
        .map((node) => `${node.id} ${node.title}：正确率 ${node.accuracy}%，得分率 ${node.scoreRate}%，未掌握错题 ${node.pendingWrongNotes}，待巩固 ${node.pendingConsolidationNotes}，作答 ${node.total} 题`)
        .join("\n") || "暂无",
      "",
      "要求：summary 要指出当前主要风险；recommendations 给出 3-5 条可执行动作；weakKnowledgeNodeIds 只能使用上方出现的 ID。"
    ].join("\n")
  };
}

async function resolveDiagnosisPreset(db: DiagnosisDatabase) {
  return resolveTaskAiPreset(db, AiTaskType.diagnose_learning, "json", {
    defaultMaxOutputTokens
  });
}
