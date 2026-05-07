import { AiTaskType, Prisma, QuestionKind, ReviewStatus, SourceType, Visibility } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, resolveAiCredential, resolveTaskAiPreset, type AiTextGenerator } from "./ai";
import { getLearningAnalysis } from "./analysis";
import { validateExtractedQuestionsJson, type ExtractedMaterialQuestion, materialQuestionKinds } from "./materials";
import { singleChoiceAnswerKeys } from "./question-admin";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type GeneratedQuestionDatabase = typeof prisma;

const promptVersion = "practice-question-generate-v1";
const defaultMaxOutputTokens = 1600;

export type GeneratePracticeQuestionsInput = {
  prompt: string;
  count?: string | number | null;
  knowledgeNodeId?: string | null;
};

export async function listGeneratedQuestionBatches(userId: string, db: GeneratedQuestionDatabase = prisma) {
  const batches = await db.generatedQuestionBatch.findMany({
    where: { userId },
    include: {
      candidates: {
        orderBy: [{ createdAt: "asc" }]
      }
    },
    orderBy: [{ createdAt: "desc" }],
    take: 20
  });

  return batches.map((batch) => ({
    id: batch.id,
    prompt: batch.prompt,
    goalPath: batch.goalPath,
    status: batch.status,
    errorSummary: batch.errorSummary,
    aiCallId: batch.aiCallId,
    createdAt: batch.createdAt,
    candidates: batch.candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      stem: candidate.stem,
      payload: candidate.payload,
      answerKey: candidate.answerKey,
      explanation: candidate.explanation,
      difficulty: candidate.difficulty,
      knowledgeNodeId: candidate.knowledgeNodeId,
      sourceRef: candidate.sourceRef,
      status: candidate.status,
      confirmedQuestionId: candidate.confirmedQuestionId
    }))
  }));
}

export async function generatePracticeQuestionCandidates(
  userId: string,
  input: GeneratePracticeQuestionsInput,
  options: {
    db?: GeneratedQuestionDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ batchId: string; aiCallId: string; candidateCount: number }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const analysis = await getLearningAnalysis(userId, db);

  if (analysis.status === "no_goal") {
    return { ok: false, error: "请先设置考试目标。" };
  }

  const promptText = input.prompt.trim();

  if (promptText.length < 4) {
    return { ok: false, error: "请描述要生成的练习题方向。" };
  }

  const count = parseCount(input.count);
  const knowledgeNodes = await listGoalKnowledgeOptions(analysis.goal, db);
  const selectedKnowledgeNodeId = optionalText(input.knowledgeNodeId);

  if (selectedKnowledgeNodeId && !knowledgeNodes.some((node) => node.id === selectedKnowledgeNodeId)) {
    return { ok: false, error: "请选择当前目标范围内的知识点。" };
  }

  const presetResult = await resolveGeneratedQuestionPreset(db);

  if (!presetResult.ok) {
    return presetResult;
  }

  const preset = presetResult.data;
  const prompt = buildPracticeQuestionGenerationPrompt({
    goalPath: analysis.goalPath,
    prompt: promptText,
    count,
    knowledgeNodes,
    selectedKnowledgeNodeId
  });
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

  const batch = await db.generatedQuestionBatch.create({
    data: {
      userId,
      goalId: analysis.goal.id,
      goalPath: analysis.goalPath,
      prompt: promptText,
      sourceContextType: "goal",
      sourceContextId: analysis.goal.id,
      status: "running"
    }
  });
  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model: preset.model,
      taskType: AiTaskType.generate_practice_questions,
      promptVersion,
      inputContextSource: `generated_question_batch:${batch.id}`,
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
    const parsed = validateExtractedQuestionsJson(result.text);

    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    await db.$transaction([
      db.generatedQuestionCandidate.createMany({
        data: parsed.data.questions.slice(0, count).map((question) => {
          const storage = toCandidateStorage(question);

          return {
            batchId: batch.id,
            kind: storage.kind,
            stem: storage.stem,
            payload: storage.payload,
            answerKey: storage.answerKey,
            explanation: optionalText(question.explanation),
            difficulty: question.difficulty ?? null,
            knowledgeNodeId: optionalText(question.knowledgeNodeId) ?? selectedKnowledgeNodeId,
            sourceRef: optionalText(question.sourceRef)
          };
        })
      }),
      db.generatedQuestionBatch.update({
        where: { id: batch.id },
        data: {
          status: "succeeded",
          aiCallId: aiCall.id,
          errorSummary: null
        }
      }),
      db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          status: "succeeded",
          usage: result.usage ?? undefined,
          errorSummary: null
        }
      })
    ]);

    return { ok: true, data: { batchId: batch.id, aiCallId: aiCall.id, candidateCount: Math.min(parsed.data.questions.length, count) } };
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message.slice(0, 240) : "AI 练习题生成失败。";

    await db.$transaction([
      db.generatedQuestionBatch.update({
        where: { id: batch.id },
        data: {
          status: "failed",
          aiCallId: aiCall.id,
          errorSummary
        }
      }),
      db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          status: "failed",
          errorSummary
        }
      })
    ]);

    return { ok: false, error: errorSummary };
  }
}

export async function confirmGeneratedQuestionCandidate(
  userId: string,
  input: { candidateId: string; knowledgeNodeId?: string | null },
  db: GeneratedQuestionDatabase = prisma
): Promise<ActionResult<{ questionId: string }>> {
  const candidate = await db.generatedQuestionCandidate.findFirst({
    where: {
      id: input.candidateId.trim(),
      batch: {
        userId
      }
    },
    include: {
      batch: true
    }
  });

  if (!candidate) {
    return { ok: false, error: "候选题不存在。" };
  }

  if (candidate.status === "confirmed" || candidate.confirmedQuestionId) {
    return { ok: false, error: "候选题已确认。" };
  }

  const knowledgeNodeId = optionalText(input.knowledgeNodeId) ?? candidate.knowledgeNodeId;

  if (!knowledgeNodeId) {
    return { ok: false, error: "候选题缺少知识点，暂不能确认。" };
  }

  const knowledgeNode = await db.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId },
    select: { id: true }
  });

  if (!knowledgeNode) {
    return { ok: false, error: "候选题知识点无效，暂不能确认。" };
  }

  const question = await db.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        ownerId: userId,
        kind: candidate.kind,
        stem: candidate.stem,
        payload: candidate.payload as Prisma.InputJsonValue,
        answerKey: candidate.answerKey as Prisma.InputJsonValue,
        explanation: candidate.explanation,
        difficulty: candidate.difficulty,
        sourceType: SourceType.ai_generated,
        sourceTitle: formatGeneratedSourceTitle(candidate.batch.prompt, candidate.sourceRef),
        visibility: Visibility.private,
        reviewStatus: ReviewStatus.approved,
        currentVersion: 1,
        knowledgeBindings: {
          create: {
            knowledgeNodeId,
            weight: 1,
            isPrimary: true
          }
        },
        versions: {
          create: {
            version: 1,
            stem: candidate.stem,
            payload: candidate.payload as Prisma.InputJsonValue,
            answerKey: candidate.answerKey as Prisma.InputJsonValue,
            explanation: candidate.explanation,
            sourceType: SourceType.ai_generated,
            visibility: Visibility.private,
            reviewStatus: ReviewStatus.approved
          }
        }
      }
    });

    await tx.generatedQuestionCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "confirmed",
        knowledgeNodeId,
        confirmedQuestionId: created.id
      }
    });

    return created;
  });

  return { ok: true, data: { questionId: question.id } };
}

export async function rejectGeneratedQuestionCandidate(userId: string, candidateId: string, db: GeneratedQuestionDatabase = prisma): Promise<ActionResult> {
  const result = await db.generatedQuestionCandidate.updateMany({
    where: {
      id: candidateId.trim(),
      status: "pending",
      batch: {
        userId
      }
    },
    data: {
      status: "rejected"
    }
  });

  return result.count > 0 ? { ok: true } : { ok: false, error: "候选题不存在或已处理。" };
}

export function buildPracticeQuestionGenerationPrompt(input: {
  goalPath: string;
  prompt: string;
  count: number;
  knowledgeNodes: { id: string; code: string | null; title: string }[];
  selectedKnowledgeNodeId: string | null;
}) {
  const selected = input.selectedKnowledgeNodeId ? input.knowledgeNodes.find((node) => node.id === input.selectedKnowledgeNodeId) : null;

  return {
    instructions: "你是 OpenExam 的练习题生成助手。必须输出严格 JSON，不要输出 Markdown。",
    input: [
      `请为当前考试目标生成 ${input.count} 道练习题候选。`,
      "输出 JSON：",
      '{"questions":[{"kind":"single_choice","stem":"题干","options":{"A":"选项A","B":"选项B","C":"选项C","D":"选项D"},"answer":"A","explanation":"解析","difficulty":2,"knowledgeNodeId":"知识点ID","sourceRef":"AI 生成"}]}',
      "题型可用：single_choice、multiple_choice、true_false、blank、short_answer、case_analysis。",
      "单选 answer 为 A/B/C/D；多选 answer 为数组；判断 answer 为 true/false；填空 answer 可为字符串或字符串数组；主观题可给 answerKey/rubric。",
      "",
      `考试目标：${input.goalPath}`,
      `出题要求：${input.prompt}`,
      selected ? `优先知识点：${selected.id} ${selected.code ?? ""} ${selected.title}` : "优先知识点：未指定",
      `可选知识点：${input.knowledgeNodes.map((node) => `${node.id} ${node.code ?? ""} ${node.title}`).join(" / ") || "无"}`,
      "",
      "要求：knowledgeNodeId 必须从可选知识点中选择；每题要有明确答案和解析；不要生成侵犯来源版权的原题复刻。"
    ].join("\n")
  };
}

async function resolveGeneratedQuestionPreset(db: GeneratedQuestionDatabase) {
  return resolveTaskAiPreset(db, AiTaskType.generate_practice_questions, "json", {
    defaultMaxOutputTokens
  });
}

async function listGoalKnowledgeOptions(goal: Extract<Awaited<ReturnType<typeof getLearningAnalysis>>, { status: "ready" }>["goal"], db: GeneratedQuestionDatabase) {
  return db.knowledgeNode.findMany({
    where: goal.subjectId
      ? {
          syllabus: {
            subjectId: goal.subjectId
          }
        }
      : goal.cycleId
        ? {
            syllabus: {
              subject: {
                cycleId: goal.cycleId
              }
            }
          }
        : goal.trackId
          ? {
              syllabus: {
                subject: {
                  cycle: {
                    trackId: goal.trackId
                  }
                }
              }
            }
          : {
              syllabus: {
                subject: {
                  cycle: {
                    track: {
                      programId: goal.programId
                    }
                  }
                }
              }
            },
    orderBy: [{ code: "asc" }],
    take: 80
  });
}

function toCandidateStorage(question: ExtractedMaterialQuestion): {
  kind: QuestionKind;
  stem: string;
  payload: Prisma.InputJsonValue;
  answerKey: Prisma.InputJsonValue;
} {
  const kind = materialQuestionKinds.includes(question.kind as never) ? (question.kind as QuestionKind) : QuestionKind.single_choice;

  if ((kind === QuestionKind.single_choice || kind === QuestionKind.multiple_choice) && question.options) {
    return {
      kind,
      stem: question.stem,
      payload: buildRichPayload(question, {
        options: singleChoiceAnswerKeys.map((key) => ({
          key,
          text: question.options?.[key] ?? "",
          ...(question.optionBlocks?.[key] ? { blocks: question.optionBlocks[key] } : {})
        }))
      }),
      answerKey: kind === QuestionKind.multiple_choice ? normalizeAnswerKey(question.answerKey, question.answer) : { value: String(question.answer ?? "").toUpperCase() }
    };
  }

  return {
    kind,
    stem: question.stem,
    payload: buildRichPayload(question, toInputJsonValue(question.payload) ?? defaultPayloadForKind(kind)),
    answerKey: normalizeAnswerKey(question.answerKey, question.answer)
  };
}

function buildRichPayload(question: ExtractedMaterialQuestion, basePayload: unknown): Prisma.InputJsonValue {
  const payload: Record<string, unknown> = basePayload && typeof basePayload === "object" && !Array.isArray(basePayload) ? { ...basePayload } : {};

  if (question.stemBlocks?.length) {
    payload.stemBlocks = question.stemBlocks;
  }

  if (question.explanationBlocks?.length) {
    payload.explanationBlocks = question.explanationBlocks;
  }

  if (question.referenceAnswer) {
    payload.referenceAnswer = question.referenceAnswer;
  }

  if (question.referenceAnswerBlocks?.length) {
    payload.referenceAnswerBlocks = question.referenceAnswerBlocks;
  }

  return toInputJsonValue(payload) ?? {};
}

function normalizeAnswerKey(answerKey: Prisma.JsonValue | null | undefined, answer: ExtractedMaterialQuestion["answer"]): Prisma.InputJsonValue {
  const fromAnswerKey = toInputJsonValue(answerKey);

  if (fromAnswerKey) {
    return fromAnswerKey;
  }

  if (Array.isArray(answer)) {
    return { values: answer };
  }

  if (answer !== null && answer !== undefined && answer !== "") {
    return { value: answer };
  }

  return {};
}

function defaultPayloadForKind(kind: QuestionKind): Prisma.InputJsonValue {
  if (kind === QuestionKind.true_false) {
    return {
      options: [
        { key: "true", text: "正确" },
        { key: "false", text: "错误" }
      ]
    };
  }

  return {};
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseCount(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 8 ? parsed : 3;
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim();

  return text || null;
}

function formatGeneratedSourceTitle(prompt: string, sourceRef: string | null) {
  const title = `AI 生成练习：${prompt.slice(0, 40)}`;

  return sourceRef ? `${title} (${sourceRef})` : title;
}
