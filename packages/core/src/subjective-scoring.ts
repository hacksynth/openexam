import { AiTaskType, Prisma } from "@prisma/client";
import { parseSubjectiveGradingOutput } from "./ai-output-schemas";
import { assertAiUsageAllowed, generateAiText, resolveAiCredential, resolveTaskAiPreset, type AiTextGenerator } from "./ai";
import { prisma } from "./prisma";

type SubjectiveScoringDatabase = typeof prisma;

export type SubjectiveScoringOptions = {
  db: SubjectiveScoringDatabase;
  env?: NodeJS.ProcessEnv;
  generateText?: AiTextGenerator;
};

export async function generateSubjectiveScoreSuggestion(
  userId: string,
  input: {
    questionId: string;
    stem: string;
    answer: string;
    maxScore: number;
    rubric: Prisma.JsonValue | null | undefined;
  },
  options: SubjectiveScoringOptions
): Promise<number | null> {
  const { db, env = process.env } = options;
  const presetResult = await resolveSubjectiveGradingPreset(db);

  if (!presetResult.ok) {
    return null;
  }

  const preset = presetResult.data;
  const prompt = buildSubjectiveGradingPrompt(input);

  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model: preset.model,
      taskType: AiTaskType.grade_subjective,
      promptVersion: "subjective-grade-v1",
      inputContextSource: `question:${input.questionId}`,
      tokenEstimate: Math.ceil(prompt.input.length / 4),
      status: "running"
    }
  });

  try {
    const credential = options.generateText ? null : await resolveAiCredential(userId, preset.provider, db, env);

    if (credential?.ok === false) {
      await markAiCallFailed(aiCall.id, credential.error, db);
      return null;
    }

    if (credential?.ok) {
      const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

      if (!usageAllowed.ok) {
        await markAiCallFailed(aiCall.id, usageAllowed.error, db);
        return null;
      }

      await db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          credentialSource: credential.data.source
        }
      });
    }

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

    const parsedScore = parseSubjectiveGradingOutput(result.text, input.maxScore);

    if (!parsedScore.ok) {
      throw new Error(parsedScore.error);
    }

    await db.aiCall.update({
      where: { id: aiCall.id },
      data: {
        status: "succeeded",
        usage: result.usage ?? undefined,
        errorSummary: null
      }
    });

    return parsedScore.data.score;
  } catch (error) {
    await markAiCallFailed(aiCall.id, error instanceof Error ? error.message.slice(0, 240) : "主观题 AI 评分失败。", db);
    return null;
  }
}

async function resolveSubjectiveGradingPreset(db: SubjectiveScoringDatabase) {
  return resolveTaskAiPreset(db, AiTaskType.grade_subjective, "text", {
    defaultMaxOutputTokens: 300,
    defaultTemperature: 0
  });
}

function buildSubjectiveGradingPrompt(input: { stem: string; answer: string; maxScore: number; rubric: Prisma.JsonValue | null | undefined }) {
  return {
    instructions: "你是 OpenExam 的主观题评分助手。只根据题干、评分标准和考生答案给出建议分，输出严格 JSON。",
    input: [
      `题干：${input.stem}`,
      `满分：${input.maxScore}`,
      `评分标准：${input.rubric ? JSON.stringify(input.rubric) : "未配置"}`,
      `考生答案：${input.answer}`,
      '只输出 {"score":数字,"reason":"一句话理由"}，score 必须在 0 到满分之间。'
    ].join("\n")
  };
}

async function markAiCallFailed(aiCallId: string, errorSummary: string, db: SubjectiveScoringDatabase) {
  await db.aiCall.update({
    where: { id: aiCallId },
    data: {
      status: "failed",
      errorSummary
    }
  });
}
