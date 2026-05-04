import {
  Prisma,
  QuestionKind,
  type ReviewStatus,
  type SourceType,
  type Visibility
} from "@prisma/client";
import {
  evaluateQuestionPublication,
  type QuestionReviewStatus,
  type QuestionSourceType,
  type QuestionVisibility
} from "./question-governance";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

export const singleChoiceAnswerKeys = ["A", "B", "C", "D"] as const;
export const questionVisibilityOptions = ["private", "unlisted", "public"] as const;
export const questionSourceTypeOptions = ["original", "authorized", "public_domain_or_open", "user_uploaded", "ai_generated", "unknown"] as const;
export const questionReviewStatusOptions = ["draft", "pending_review", "approved", "rejected", "needs_changes", "takedown"] as const;
export const adminQuestionArchiveFilters = ["active", "archived", "all"] as const;

export type SingleChoiceAnswerKey = (typeof singleChoiceAnswerKeys)[number];
export type AdminQuestionArchiveFilter = (typeof adminQuestionArchiveFilters)[number];

export type AdminQuestionFilters = {
  q?: string | null;
  knowledgeNodeId?: string | null;
  visibility?: string | null;
  sourceType?: string | null;
  reviewStatus?: string | null;
  difficulty?: string | number | null;
  archived?: string | null;
};

export type SingleChoiceQuestionInput = {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer: string;
  explanation?: string | null;
  difficulty?: string | number | null;
  knowledgeNodeId: string;
  visibility?: string | null;
  sourceType?: string | null;
  reviewStatus?: string | null;
};

export type SingleChoiceQuestionImportInput = {
  jsonPayload: string;
};

type ParsedSingleChoiceQuestion = {
  stem: string;
  payload: {
    options: { key: SingleChoiceAnswerKey; text: string }[];
  };
  answerKey: {
    value: SingleChoiceAnswerKey;
  };
  explanation: string | null;
  difficulty: number | null;
  knowledgeNodeId: string;
  visibility: QuestionVisibility;
  sourceType: QuestionSourceType;
  reviewStatus: QuestionReviewStatus;
};

const adminQuestionInclude = {
  knowledgeBindings: {
    include: {
      knowledgeNode: {
        include: {
          syllabus: {
            include: {
              subject: {
                include: {
                  cycle: {
                    include: {
                      track: {
                        include: {
                          program: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  versions: {
    orderBy: {
      version: "desc"
    },
    take: 1
  }
} satisfies Prisma.QuestionInclude;

type AdminQuestionRecord = Prisma.QuestionGetPayload<{ include: typeof adminQuestionInclude }>;

export function normalizeAdminQuestionFilters(filters: AdminQuestionFilters = {}) {
  const difficulty = parseFilterDifficulty(filters.difficulty);

  return {
    q: optionalText(filters.q),
    knowledgeNodeId: optionalText(filters.knowledgeNodeId),
    visibility: parseFilterEnum(filters.visibility, questionVisibilityOptions),
    sourceType: parseFilterEnum(filters.sourceType, questionSourceTypeOptions),
    reviewStatus: parseFilterEnum(filters.reviewStatus, questionReviewStatusOptions),
    difficulty,
    archived: parseFilterEnum(filters.archived, adminQuestionArchiveFilters) ?? "active"
  };
}

export async function listAdminQuestions(filters: AdminQuestionFilters = {}) {
  const normalized = normalizeAdminQuestionFilters(filters);
  const where: Prisma.QuestionWhereInput = {
    kind: QuestionKind.single_choice,
    ...(normalized.archived === "active" ? { deletedAt: null } : {}),
    ...(normalized.archived === "archived" ? { deletedAt: { not: null } } : {}),
    ...(normalized.q
      ? {
          stem: {
            contains: normalized.q,
            mode: "insensitive"
          }
        }
      : {}),
    ...(normalized.knowledgeNodeId
      ? {
          knowledgeBindings: {
            some: {
              knowledgeNodeId: normalized.knowledgeNodeId
            }
          }
        }
      : {}),
    ...(normalized.visibility ? { visibility: normalized.visibility as Visibility } : {}),
    ...(normalized.sourceType ? { sourceType: normalized.sourceType as SourceType } : {}),
    ...(normalized.reviewStatus ? { reviewStatus: normalized.reviewStatus as ReviewStatus } : {}),
    ...(typeof normalized.difficulty === "number" ? { difficulty: normalized.difficulty } : {})
  };

  const questions = await prisma.question.findMany({
    where,
    include: adminQuestionInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: 100
  });

  return questions.map(toAdminQuestion);
}

export async function createSingleChoiceQuestion(input: SingleChoiceQuestionInput): Promise<ActionResult> {
  const parsed = await parseSingleChoiceQuestionInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    await prisma.question.create({
      data: {
        kind: QuestionKind.single_choice,
        currentVersion: 1,
        ...questionData(parsed.data),
        knowledgeBindings: {
          create: {
            knowledgeNodeId: parsed.data.knowledgeNodeId,
            weight: 1,
            isPrimary: true
          }
        },
        versions: {
          create: {
            version: 1,
            stem: parsed.data.stem,
            payload: parsed.data.payload,
            answerKey: parsed.data.answerKey,
            explanation: parsed.data.explanation,
            sourceType: parsed.data.sourceType,
            visibility: parsed.data.visibility,
            reviewStatus: parsed.data.reviewStatus
          }
        }
      }
    });

    return { ok: true };
  } catch (error) {
    return databaseError(error, "题目创建失败。");
  }
}

export async function importSingleChoiceQuestions(input: SingleChoiceQuestionImportInput): Promise<ActionResult<{ count: number }>> {
  const parsed = validateSingleChoiceQuestionImportPayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const knowledgeNodeIds = [...new Set(parsed.data.questions.map((question) => question.knowledgeNodeId))];
  const knowledgeNodes = await prisma.knowledgeNode.findMany({
    where: {
      id: {
        in: knowledgeNodeIds
      }
    },
    select: {
      id: true
    }
  });
  const existingKnowledgeNodeIds = new Set(knowledgeNodes.map((node) => node.id));
  const invalidKnowledgeIndex = parsed.data.questions.findIndex((question) => !existingKnowledgeNodeIds.has(question.knowledgeNodeId));

  if (invalidKnowledgeIndex >= 0) {
    return { ok: false, error: `第 ${invalidKnowledgeIndex + 1} 题：请选择有效的知识点。` };
  }

  try {
    await prisma.$transaction(
      parsed.data.questions.map((question) =>
        prisma.question.create({
          data: {
            kind: QuestionKind.single_choice,
            currentVersion: 1,
            ...questionData(question),
            knowledgeBindings: {
              create: {
                knowledgeNodeId: question.knowledgeNodeId,
                weight: 1,
                isPrimary: true
              }
            },
            versions: {
              create: {
                version: 1,
                stem: question.stem,
                payload: question.payload,
                answerKey: question.answerKey,
                explanation: question.explanation,
                sourceType: question.sourceType,
                visibility: question.visibility,
                reviewStatus: question.reviewStatus
              }
            }
          }
        })
      )
    );

    return { ok: true, data: { count: parsed.data.questions.length } };
  } catch (error) {
    return databaseError(error, "题目导入失败。");
  }
}

export async function updateSingleChoiceQuestion(id: string, input: SingleChoiceQuestionInput): Promise<ActionResult> {
  const parsed = await parseSingleChoiceQuestionInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  if (!id.trim()) {
    return { ok: false, error: "题目不存在。" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const question = await tx.question.findFirst({
        where: {
          id,
          kind: QuestionKind.single_choice,
          deletedAt: null
        },
        select: {
          id: true,
          currentVersion: true
        }
      });

      if (!question) {
        throw new QuestionAdminError("题目不存在。");
      }

      await tx.question.update({
        where: { id: question.id },
        data: questionData(parsed.data)
      });

      await tx.questionKnowledgeNode.deleteMany({
        where: {
          questionId: question.id
        }
      });
      await tx.questionKnowledgeNode.create({
        data: {
          questionId: question.id,
          knowledgeNodeId: parsed.data.knowledgeNodeId,
          weight: 1,
          isPrimary: true
        }
      });

      await tx.questionVersion.upsert({
        where: {
          questionId_version: {
            questionId: question.id,
            version: question.currentVersion
          }
        },
        update: {
          stem: parsed.data.stem,
          payload: parsed.data.payload,
          answerKey: parsed.data.answerKey,
          explanation: parsed.data.explanation,
          sourceType: parsed.data.sourceType,
          visibility: parsed.data.visibility,
          reviewStatus: parsed.data.reviewStatus
        },
        create: {
          questionId: question.id,
          version: question.currentVersion,
          stem: parsed.data.stem,
          payload: parsed.data.payload,
          answerKey: parsed.data.answerKey,
          explanation: parsed.data.explanation,
          sourceType: parsed.data.sourceType,
          visibility: parsed.data.visibility,
          reviewStatus: parsed.data.reviewStatus
        }
      });
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof QuestionAdminError) {
      return { ok: false, error: error.message };
    }

    return databaseError(error, "题目更新失败。");
  }
}

export async function updateSingleChoiceQuestionReviewStatus(id: string, reviewStatus: string): Promise<ActionResult> {
  const parsedReviewStatus = parseEnum(reviewStatus, questionReviewStatusOptions, "draft");

  if (!parsedReviewStatus.ok) {
    return parsedReviewStatus;
  }

  if (!id.trim()) {
    return { ok: false, error: "题目不存在。" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const question = await tx.question.findFirst({
        where: {
          id,
          kind: QuestionKind.single_choice,
          deletedAt: null
        },
        select: {
          id: true,
          currentVersion: true,
          visibility: true,
          sourceType: true
        }
      });

      if (!question) {
        throw new QuestionAdminError("题目不存在。");
      }

      const publication = evaluateQuestionPublication({
        visibility: question.visibility,
        sourceType: question.sourceType,
        reviewStatus: parsedReviewStatus.value
      });

      if (!publication.allowed) {
        throw new QuestionAdminError(publicationError(publication.reasons));
      }

      await tx.question.update({
        where: { id: question.id },
        data: {
          reviewStatus: parsedReviewStatus.value as ReviewStatus
        }
      });

      await tx.questionVersion.updateMany({
        where: {
          questionId: question.id,
          version: question.currentVersion
        },
        data: {
          reviewStatus: parsedReviewStatus.value as ReviewStatus
        }
      });
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof QuestionAdminError) {
      return { ok: false, error: error.message };
    }

    return databaseError(error, "题目审核状态更新失败。");
  }
}

export async function setSingleChoiceQuestionArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!id.trim()) {
    return { ok: false, error: "题目不存在。" };
  }

  try {
    const result = await prisma.question.updateMany({
      where: {
        id,
        kind: QuestionKind.single_choice
      },
      data: {
        deletedAt: archived ? new Date() : null
      }
    });

    return result.count > 0 ? { ok: true } : { ok: false, error: "题目不存在。" };
  } catch (error) {
    return databaseError(error, archived ? "题目归档失败。" : "题目恢复失败。");
  }
}

export function validateSingleChoiceQuestionInput(input: SingleChoiceQuestionInput) {
  return parseSingleChoiceQuestionInputSync(input);
}

export function validateSingleChoiceQuestionImportPayload(input: SingleChoiceQuestionImportInput) {
  const jsonPayload = input.jsonPayload.trim();

  if (!jsonPayload) {
    return { ok: false, error: "请填写题目 JSON。" } as const;
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(jsonPayload);
  } catch {
    return { ok: false, error: "JSON 格式无效。" } as const;
  }

  const items = Array.isArray(parsedJson) ? parsedJson : isPlainObject(parsedJson) && Array.isArray(parsedJson.questions) ? parsedJson.questions : null;

  if (!items || items.length === 0) {
    return { ok: false, error: "导入内容必须是非空题目数组。" } as const;
  }

  if (items.length > 100) {
    return { ok: false, error: "单次最多导入 100 道题。" } as const;
  }

  const questions: ParsedSingleChoiceQuestion[] = [];
  const errors: string[] = [];

  items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`第 ${index + 1} 题：导入项必须是对象。`);
      return;
    }

    const result = parseSingleChoiceQuestionInputSync(toImportQuestionInput(item));

    if (!result.ok) {
      errors.push(`第 ${index + 1} 题：${result.error}`);
      return;
    }

    questions.push(result.data);
  });

  if (errors.length > 0) {
    return { ok: false, error: errors.slice(0, 5).join("；") } as const;
  }

  return {
    ok: true,
    data: {
      questions
    }
  } as const;
}

async function parseSingleChoiceQuestionInput(input: SingleChoiceQuestionInput) {
  const parsed = parseSingleChoiceQuestionInputSync(input);

  if (!parsed.ok) {
    return parsed;
  }

  const knowledgeNode = await prisma.knowledgeNode.findUnique({
    where: {
      id: parsed.data.knowledgeNodeId
    },
    select: {
      id: true
    }
  });

  if (!knowledgeNode) {
    return { ok: false, error: "请选择有效的知识点。" } as const;
  }

  return parsed;
}

function parseSingleChoiceQuestionInputSync(input: SingleChoiceQuestionInput) {
  const stem = input.stem.trim();
  const options: ParsedSingleChoiceQuestion["payload"]["options"] = [
    { key: "A", text: input.optionA.trim() },
    { key: "B", text: input.optionB.trim() },
    { key: "C", text: input.optionC.trim() },
    { key: "D", text: input.optionD.trim() }
  ];
  const answer = input.answer.trim().toUpperCase();
  const difficulty = parseDifficulty(input.difficulty);
  const visibility = parseEnum(input.visibility, questionVisibilityOptions, "private");
  const sourceType = parseEnum(input.sourceType, questionSourceTypeOptions, "original");
  const reviewStatus = parseEnum(input.reviewStatus, questionReviewStatusOptions, "draft");
  const explanation = optionalText(input.explanation);
  const knowledgeNodeId = input.knowledgeNodeId.trim();

  if (!stem) {
    return { ok: false, error: "题干不能为空。" } as const;
  }

  if (options.some((option) => !option.text)) {
    return { ok: false, error: "A/B/C/D 四个选项都必须填写。" } as const;
  }

  if (!singleChoiceAnswerKeys.includes(answer as SingleChoiceAnswerKey)) {
    return { ok: false, error: "正确答案只能是 A、B、C 或 D。" } as const;
  }

  if (!difficulty.ok) {
    return difficulty;
  }

  if (!visibility.ok) {
    return visibility;
  }

  if (!sourceType.ok) {
    return sourceType;
  }

  if (!reviewStatus.ok) {
    return reviewStatus;
  }

  if (!knowledgeNodeId) {
    return { ok: false, error: "请选择主知识点。" } as const;
  }

  const publication = evaluateQuestionPublication({
    visibility: visibility.value,
    sourceType: sourceType.value,
    reviewStatus: reviewStatus.value
  });

  if (!publication.allowed) {
    return { ok: false, error: publicationError(publication.reasons) } as const;
  }

  return {
    ok: true,
    data: {
      stem,
      payload: {
        options
      },
      answerKey: {
        value: answer as SingleChoiceAnswerKey
      },
      explanation,
      difficulty: difficulty.value,
      knowledgeNodeId,
      visibility: visibility.value,
      sourceType: sourceType.value,
      reviewStatus: reviewStatus.value
    }
  } as const;
}

function toImportQuestionInput(item: Record<string, unknown>): SingleChoiceQuestionInput {
  const options = isPlainObject(item.options) ? item.options : {};

  return {
    stem: textValue(item.stem),
    optionA: textValue(item.optionA ?? options.A ?? options.a),
    optionB: textValue(item.optionB ?? options.B ?? options.b),
    optionC: textValue(item.optionC ?? options.C ?? options.c),
    optionD: textValue(item.optionD ?? options.D ?? options.d),
    answer: textValue(item.answer),
    explanation: textValue(item.explanation),
    difficulty: typeof item.difficulty === "number" ? item.difficulty : textValue(item.difficulty),
    knowledgeNodeId: textValue(item.knowledgeNodeId),
    visibility: textValue(item.visibility),
    sourceType: textValue(item.sourceType),
    reviewStatus: textValue(item.reviewStatus)
  };
}

function questionData(data: ParsedSingleChoiceQuestion) {
  return {
    stem: data.stem,
    payload: data.payload,
    answerKey: data.answerKey,
    explanation: data.explanation,
    difficulty: data.difficulty,
    sourceType: data.sourceType as SourceType,
    visibility: data.visibility as Visibility,
    reviewStatus: data.reviewStatus as ReviewStatus,
    deletedAt: null
  };
}

function toAdminQuestion(question: AdminQuestionRecord) {
  const version = question.versions.find((item) => item.version === question.currentVersion) ?? question.versions[0] ?? null;
  const payload = version?.payload ?? question.payload;
  const answerKey = version?.answerKey ?? question.answerKey;
  const options = readOptions(payload);
  const primaryBinding = question.knowledgeBindings.find((binding) => binding.isPrimary) ?? question.knowledgeBindings[0] ?? null;

  return {
    id: question.id,
    stem: version?.stem ?? question.stem,
    optionA: options.A,
    optionB: options.B,
    optionC: options.C,
    optionD: options.D,
    answer: readAnswer(answerKey),
    explanation: version?.explanation ?? question.explanation ?? "",
    difficulty: question.difficulty,
    visibility: question.visibility,
    sourceType: question.sourceType,
    reviewStatus: question.reviewStatus,
    currentVersion: question.currentVersion,
    updatedAt: question.updatedAt,
    archived: Boolean(question.deletedAt),
    deletedAt: question.deletedAt,
    knowledgeNodeId: primaryBinding?.knowledgeNodeId ?? "",
    knowledgePath: primaryBinding ? formatKnowledgePath(primaryBinding.knowledgeNode) : "未绑定知识点"
  };
}

function readOptions(payload: Prisma.JsonValue | null | undefined) {
  const empty = { A: "", B: "", C: "", D: "" };

  if (!isJsonObject(payload) || !Array.isArray(payload.options)) {
    return empty;
  }

  for (const item of payload.options) {
    if (isJsonObject(item) && typeof item.key === "string" && typeof item.text === "string" && item.key in empty) {
      empty[item.key as SingleChoiceAnswerKey] = item.text;
    }
  }

  return empty;
}

function readAnswer(answerKey: Prisma.JsonValue | null | undefined) {
  if (isJsonObject(answerKey) && typeof answerKey.value === "string") {
    return answerKey.value;
  }

  if (typeof answerKey === "string" || typeof answerKey === "number" || typeof answerKey === "boolean") {
    return String(answerKey);
  }

  return "";
}

function formatKnowledgePath(node: AdminQuestionRecord["knowledgeBindings"][number]["knowledgeNode"]) {
  const subject = node.syllabus.subject;
  const cycle = subject.cycle;
  const track = cycle.track;

  return `${track.program.name} / ${track.name} / ${cycle.name} / ${subject.name} / ${node.title}`;
}

function parseDifficulty(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null } as const;
  }

  const difficulty = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    return { ok: false, error: "难度必须是 1 到 5 的整数，或留空。" } as const;
  }

  return { ok: true, value: difficulty } as const;
}

function parseEnum<const T extends readonly string[]>(value: string | null | undefined, options: T, fallback: T[number]) {
  const normalized = value?.trim() || fallback;

  if (!options.includes(normalized as T[number])) {
    return { ok: false, error: "题目状态参数无效。" } as const;
  }

  return { ok: true, value: normalized as T[number] } as const;
}

function parseFilterEnum<const T extends readonly string[]>(value: string | null | undefined, options: T) {
  const normalized = value?.trim();

  if (!normalized || !options.includes(normalized as T[number])) {
    return null;
  }

  return normalized as T[number];
}

function parseFilterDifficulty(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const difficulty = typeof value === "number" ? value : Number(value);

  return Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null;
}

function publicationError(reasons: string[]) {
  if (reasons.includes("Public questions must be approved.")) {
    return "公开题必须是已审核通过状态。";
  }

  if (reasons.some((reason) => reason.includes("source") || reason.includes("AI-generated") || reason.includes("Unknown-source"))) {
    return "公开题来源必须是原创、授权或公开开放来源。";
  }

  return "题目公开状态不符合治理规则。";
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim();

  return text ? text : null;
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function databaseError(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { ok: false, error: `${fallback} (${error.code})` };
  }

  return { ok: false, error: fallback };
}

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

class QuestionAdminError extends Error {}
