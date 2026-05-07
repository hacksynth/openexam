import {
  Prisma,
  QuestionKind,
  type ReviewStatus,
  type SourceType,
  type Visibility
} from "@prisma/client";
import Papa from "papaparse";
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
export const adminQuestionKindOptions = ["single_choice", "multiple_choice", "true_false", "blank", "short_answer", "case_analysis"] as const;
export const questionVisibilityOptions = ["private", "unlisted", "public"] as const;
export const questionSourceTypeOptions = ["original", "authorized", "public_domain_or_open", "user_uploaded", "ai_generated", "unknown"] as const;
export const questionReviewStatusOptions = ["draft", "pending_review", "approved", "rejected", "needs_changes", "takedown"] as const;
export const adminQuestionArchiveFilters = ["active", "archived", "all"] as const;

export type SingleChoiceAnswerKey = (typeof singleChoiceAnswerKeys)[number];
export type AdminQuestionKind = (typeof adminQuestionKindOptions)[number];
export type AdminQuestionArchiveFilter = (typeof adminQuestionArchiveFilters)[number];

export type AdminQuestionFilters = {
  q?: string | null;
  kind?: string | null;
  knowledgeNodeId?: string | null;
  visibility?: string | null;
  sourceType?: string | null;
  reviewStatus?: string | null;
  difficulty?: string | number | null;
  archived?: string | null;
};

export type AdminQuestionInput = {
  kind?: string | null;
  stem: string;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  answer?: string | null;
  caseMaterial?: string | null;
  payloadJson?: string | null;
  answerKeyJson?: string | null;
  rubricJson?: string | null;
  explanation?: string | null;
  difficulty?: string | number | null;
  knowledgeNodeId: string;
  visibility?: string | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceLicense?: string | null;
  reviewStatus?: string | null;
};

export type SingleChoiceQuestionInput = AdminQuestionInput;

export type AdminQuestionImportInput = {
  jsonPayload: string;
};

export type AdminQuestionCsvImportInput = {
  csvText: string;
};

export type SingleChoiceQuestionImportInput = AdminQuestionImportInput;

type ParsedAdminQuestion = {
  kind: QuestionKind;
  stem: string;
  payload: Prisma.InputJsonValue;
  answerKey: Prisma.InputJsonValue;
  rubric: Prisma.InputJsonValue | null;
  explanation: string | null;
  difficulty: number | null;
  knowledgeNodeId: string;
  visibility: QuestionVisibility;
  sourceType: QuestionSourceType;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceLicense: string | null;
  reviewStatus: QuestionReviewStatus;
};

const adminQuestionInclude = {
  owner: {
    select: {
      email: true,
      name: true
    }
  },
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
  const kind = parseFilterEnum(filters.kind, adminQuestionKindOptions);

  return {
    q: optionalText(filters.q),
    ...(kind ? { kind } : {}),
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
    ...(normalized.kind ? { kind: normalized.kind as QuestionKind } : {}),
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

export async function createAdminQuestion(input: AdminQuestionInput): Promise<ActionResult> {
  const parsed = await parseAdminQuestionInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    await prisma.question.create({
      data: {
        kind: parsed.data.kind,
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
            rubric: parsed.data.rubric ?? Prisma.DbNull,
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

export async function createSingleChoiceQuestion(input: SingleChoiceQuestionInput): Promise<ActionResult> {
  return createAdminQuestion({ ...input, kind: input.kind ?? QuestionKind.single_choice });
}

export async function importAdminQuestions(input: AdminQuestionImportInput): Promise<ActionResult<{ count: number }>> {
  const parsed = validateAdminQuestionImportPayload(input);

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
            kind: question.kind,
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
                rubric: question.rubric ?? Prisma.DbNull,
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

export async function importSingleChoiceQuestions(input: SingleChoiceQuestionImportInput): Promise<ActionResult<{ count: number }>> {
  return importAdminQuestions(input);
}

export async function importAdminQuestionsFromCsv(input: AdminQuestionCsvImportInput): Promise<ActionResult<{ count: number }>> {
  const csvText = input.csvText.trim();

  if (!csvText) {
    return { ok: false, error: "请上传包含题目数据的 CSV 文件。" };
  }

  const parseResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
    return { ok: false, error: `CSV 解析失败：${parseResult.errors[0].message}` };
  }

  const rows = parseResult.data.filter((row) => Object.values(row).some((value) => value.trim() !== ""));

  if (rows.length === 0) {
    return { ok: false, error: "CSV 文件无有效数据行。" };
  }

  if (rows.length > 100) {
    return { ok: false, error: "单次最多导入 100 道题。" };
  }

  const questions: ParsedAdminQuestion[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const result = parseAdminQuestionInputSync(toImportQuestionCsvRow(row));

    if (!result.ok) {
      errors.push(`第 ${index + 1} 题：${result.error}`);
      return;
    }

    questions.push(result.data);
  });

  if (errors.length > 0) {
    return { ok: false, error: errors.slice(0, 5).join("；") };
  }

  const knowledgeNodeIds = [...new Set(questions.map((question) => question.knowledgeNodeId))];
  const knowledgeNodes = await prisma.knowledgeNode.findMany({
    where: { id: { in: knowledgeNodeIds } },
    select: { id: true }
  });
  const existingKnowledgeNodeIds = new Set(knowledgeNodes.map((node) => node.id));
  const invalidKnowledgeIndex = questions.findIndex((question) => !existingKnowledgeNodeIds.has(question.knowledgeNodeId));

  if (invalidKnowledgeIndex >= 0) {
    return { ok: false, error: `第 ${invalidKnowledgeIndex + 1} 题：请选择有效的知识点。` };
  }

  try {
    await prisma.$transaction(
      questions.map((question) =>
        prisma.question.create({
          data: {
            kind: question.kind,
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
                rubric: question.rubric ?? Prisma.DbNull,
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

    return { ok: true, data: { count: questions.length } };
  } catch (error) {
    return databaseError(error, "CSV 题目导入失败。");
  }
}

export async function updateAdminQuestion(id: string, input: AdminQuestionInput): Promise<ActionResult> {
  const parsed = await parseAdminQuestionInput(input);

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
        data: {
          kind: parsed.data.kind,
          ...questionData(parsed.data)
        }
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
          rubric: parsed.data.rubric ?? Prisma.DbNull,
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
          rubric: parsed.data.rubric ?? Prisma.DbNull,
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

export async function updateSingleChoiceQuestion(id: string, input: SingleChoiceQuestionInput): Promise<ActionResult> {
  return updateAdminQuestion(id, input);
}

export async function updateAdminQuestionReviewStatus(id: string, reviewStatus: string): Promise<ActionResult> {
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

export async function updateSingleChoiceQuestionReviewStatus(id: string, reviewStatus: string): Promise<ActionResult> {
  return updateAdminQuestionReviewStatus(id, reviewStatus);
}

export async function setAdminQuestionArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!id.trim()) {
    return { ok: false, error: "题目不存在。" };
  }

  try {
    const result = await prisma.question.updateMany({
      where: {
        id
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

export async function setSingleChoiceQuestionArchived(id: string, archived: boolean): Promise<ActionResult> {
  return setAdminQuestionArchived(id, archived);
}

export function validateAdminQuestionInput(input: AdminQuestionInput) {
  return parseAdminQuestionInputSync(input);
}

export function validateSingleChoiceQuestionInput(input: SingleChoiceQuestionInput) {
  return parseAdminQuestionInputSync({ ...input, kind: input.kind ?? QuestionKind.single_choice });
}

export function validateAdminQuestionImportPayload(input: AdminQuestionImportInput) {
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

  const questions: ParsedAdminQuestion[] = [];
  const errors: string[] = [];

  items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`第 ${index + 1} 题：导入项必须是对象。`);
      return;
    }

    const result = parseAdminQuestionInputSync(toImportQuestionInput(item));

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

export function validateSingleChoiceQuestionImportPayload(input: SingleChoiceQuestionImportInput) {
  return validateAdminQuestionImportPayload(input);
}

async function parseAdminQuestionInput(input: AdminQuestionInput) {
  const parsed = parseAdminQuestionInputSync(input);

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

function parseAdminQuestionInputSync(input: AdminQuestionInput) {
  const stem = input.stem.trim();
  const kind = parseEnum(input.kind, adminQuestionKindOptions, QuestionKind.single_choice);
  const difficulty = parseDifficulty(input.difficulty);
  const visibility = parseEnum(input.visibility, questionVisibilityOptions, "private");
  const sourceType = parseEnum(input.sourceType, questionSourceTypeOptions, "original");
  const reviewStatus = parseEnum(input.reviewStatus, questionReviewStatusOptions, "draft");
  const explanation = optionalText(input.explanation);
  const sourceTitle = optionalText(input.sourceTitle);
  const sourceUrl = optionalText(input.sourceUrl);
  const sourceLicense = optionalText(input.sourceLicense);
  const knowledgeNodeId = input.knowledgeNodeId.trim();
  const payloadOverride = parseOptionalJson(input.payloadJson, "payload JSON");
  const answerKeyOverride = parseOptionalJson(input.answerKeyJson, "answerKey JSON");
  const rubricOverride = parseOptionalJson(input.rubricJson, "rubric JSON");

  if (!stem) {
    return { ok: false, error: "题干不能为空。" } as const;
  }

  if (!kind.ok) {
    return kind;
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

  if (!payloadOverride.ok) {
    return payloadOverride;
  }

  if (!answerKeyOverride.ok) {
    return answerKeyOverride;
  }

  if (!rubricOverride.ok) {
    return rubricOverride;
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

  if (visibility.value === "public" && sourceType.value !== "original" && (!sourceTitle || !sourceLicense)) {
    return { ok: false, error: "公开题必须填写来源标题和来源许可。" } as const;
  }

  const storage = buildQuestionStorage({
    kind: kind.value as QuestionKind,
    optionA: input.optionA,
    optionB: input.optionB,
    optionC: input.optionC,
    optionD: input.optionD,
    answer: input.answer,
    caseMaterial: input.caseMaterial,
    payloadOverride: payloadOverride.data,
    answerKeyOverride: answerKeyOverride.data,
    rubricOverride: rubricOverride.data
  });

  if (!storage.ok) {
    return storage;
  }

  return {
    ok: true,
    data: {
      kind: kind.value as QuestionKind,
      stem,
      payload: storage.data.payload,
      answerKey: storage.data.answerKey,
      rubric: storage.data.rubric,
      explanation,
      difficulty: difficulty.value,
      knowledgeNodeId,
      visibility: visibility.value,
      sourceType: sourceType.value,
      sourceTitle,
      sourceUrl,
      sourceLicense,
      reviewStatus: reviewStatus.value
    }
  } as const;
}

function buildQuestionStorage(input: {
  kind: QuestionKind;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  answer?: string | null;
  caseMaterial?: string | null;
  payloadOverride: Prisma.InputJsonValue | null;
  answerKeyOverride: Prisma.InputJsonValue | null;
  rubricOverride: Prisma.InputJsonValue | null;
}): ActionResult<{ payload: Prisma.InputJsonValue; answerKey: Prisma.InputJsonValue; rubric: Prisma.InputJsonValue | null }> {
  const answer = String(input.answer ?? "").trim();

  if (input.kind === QuestionKind.single_choice || input.kind === QuestionKind.multiple_choice) {
    const options = [
      { key: "A", text: String(input.optionA ?? "").trim() },
      { key: "B", text: String(input.optionB ?? "").trim() },
      { key: "C", text: String(input.optionC ?? "").trim() },
      { key: "D", text: String(input.optionD ?? "").trim() }
    ];

    if (options.some((option) => !option.text)) {
      return { ok: false, error: "A/B/C/D 四个选项都必须填写。" };
    }

    if (input.kind === QuestionKind.single_choice) {
      const normalized = answer.toUpperCase();

      if (!singleChoiceAnswerKeys.includes(normalized as SingleChoiceAnswerKey)) {
        return { ok: false, error: "正确答案只能是 A、B、C 或 D。" };
      }

      return {
        ok: true,
        data: {
          payload: mergeChoicePayloadOverride({ options }, input.payloadOverride),
          answerKey: input.answerKeyOverride ?? { value: normalized },
          rubric: input.rubricOverride
        }
      };
    }

    const values = parseAnswerValues(answer);

    if (values.length === 0 || values.some((value) => !singleChoiceAnswerKeys.includes(value as SingleChoiceAnswerKey))) {
      return { ok: false, error: "多选题答案请用 A/B/C/D 组合，以逗号或空格分隔。" };
    }

    return {
      ok: true,
      data: {
        payload: mergeChoicePayloadOverride({ options }, input.payloadOverride),
        answerKey: input.answerKeyOverride ?? { values },
        rubric: input.rubricOverride
      }
    };
  }

  if (input.kind === QuestionKind.true_false) {
    const value = parseTrueFalseAnswer(answer);

    if (value === null && !input.answerKeyOverride) {
      return { ok: false, error: "判断题答案只能是 true/false、正确/错误 或 对/错。" };
    }

    return {
      ok: true,
      data: {
        payload:
          input.payloadOverride ??
          {
            options: [
              { key: "true", text: "正确" },
              { key: "false", text: "错误" }
            ]
          },
        answerKey: input.answerKeyOverride ?? { value },
        rubric: input.rubricOverride
      }
    };
  }

  if (input.kind === QuestionKind.blank) {
    if (!answer && !input.answerKeyOverride) {
      return { ok: false, error: "填空题答案不能为空。" };
    }

    return {
      ok: true,
      data: {
        payload: input.payloadOverride ?? {},
        answerKey: input.answerKeyOverride ?? { value: answer },
        rubric: input.rubricOverride
      }
    };
  }

  if (input.kind === QuestionKind.case_analysis) {
    const caseMaterial = input.caseMaterial ?? null;

    return {
      ok: true,
      data: {
        payload: input.payloadOverride ?? (caseMaterial ? { caseMaterial } : {}),
        answerKey: input.answerKeyOverride ?? (answer ? { value: answer } : {}),
        rubric: input.rubricOverride ?? (answer ? { referenceAnswer: answer } : null)
      }
    };
  }

  return {
    ok: true,
    data: {
      payload: input.payloadOverride ?? {},
      answerKey: input.answerKeyOverride ?? (answer ? { value: answer } : {}),
      rubric: input.rubricOverride ?? (answer ? { referenceAnswer: answer } : null)
    }
  };
}

function mergeChoicePayloadOverride(
  defaultPayload: { options: { key: string; text: string }[] },
  override: Prisma.InputJsonValue | null
): Prisma.InputJsonValue {
  if (!isPlainObject(override)) {
    return defaultPayload;
  }

  const overrideObject = override as Record<string, unknown>;
  const mergedOptions = defaultPayload.options.map((option) => {
    const overrideOption = Array.isArray(overrideObject.options)
      ? overrideObject.options.find((item: unknown) => isPlainObject(item) && item.key === option.key)
      : null;

    return isPlainObject(overrideOption) && Array.isArray(overrideOption.blocks) ? { ...option, blocks: overrideOption.blocks } : option;
  });

  return JSON.parse(JSON.stringify({ ...overrideObject, options: mergedOptions })) as Prisma.InputJsonValue;
}

function toImportQuestionCsvRow(row: Record<string, string>): AdminQuestionInput {
  return {
    kind: row.kind ?? "",
    stem: row.stem ?? "",
    optionA: row.optionA ?? "",
    optionB: row.optionB ?? "",
    optionC: row.optionC ?? "",
    optionD: row.optionD ?? "",
    answer: row.answer ?? "",
    explanation: row.explanation ?? "",
    difficulty: row.difficulty ?? "",
    knowledgeNodeId: row.knowledgeNodeId ?? "",
    visibility: row.visibility ?? "",
    sourceType: row.sourceType ?? "",
    sourceTitle: row.sourceTitle ?? "",
    sourceUrl: row.sourceUrl ?? "",
    sourceLicense: row.sourceLicense ?? "",
    reviewStatus: row.reviewStatus ?? ""
  };
}

function toImportQuestionInput(item: Record<string, unknown>): AdminQuestionInput {
  const options = isPlainObject(item.options) ? item.options : {};

  return {
    kind: textValue(item.kind),
    stem: textValue(item.stem),
    optionA: textValue(item.optionA ?? options.A ?? options.a),
    optionB: textValue(item.optionB ?? options.B ?? options.b),
    optionC: textValue(item.optionC ?? options.C ?? options.c),
    optionD: textValue(item.optionD ?? options.D ?? options.d),
    answer: answerTextValue(item.answer ?? readValueFromAnswerKey(item.answerKey)),
    payloadJson: jsonTextValue(item.payload),
    answerKeyJson: jsonTextValue(item.answerKey),
    rubricJson: jsonTextValue(item.rubric),
    explanation: textValue(item.explanation),
    difficulty: typeof item.difficulty === "number" ? item.difficulty : textValue(item.difficulty),
    knowledgeNodeId: textValue(item.knowledgeNodeId),
    visibility: textValue(item.visibility),
    sourceType: textValue(item.sourceType),
    sourceTitle: textValue(item.sourceTitle),
    sourceUrl: textValue(item.sourceUrl),
    sourceLicense: textValue(item.sourceLicense),
    reviewStatus: textValue(item.reviewStatus)
  };
}

function questionData(data: ParsedAdminQuestion) {
  return {
    stem: data.stem,
    payload: data.payload,
    answerKey: data.answerKey,
    rubric: data.rubric ?? Prisma.DbNull,
    explanation: data.explanation,
    difficulty: data.difficulty,
    sourceType: data.sourceType as SourceType,
    sourceTitle: data.sourceTitle,
    sourceUrl: data.sourceUrl,
    sourceLicense: data.sourceLicense,
    visibility: data.visibility as Visibility,
    reviewStatus: data.reviewStatus as ReviewStatus,
    deletedAt: null
  };
}

function toAdminQuestion(question: AdminQuestionRecord) {
  const version = question.versions.find((item) => item.version === question.currentVersion) ?? question.versions[0] ?? null;
  const payload = version?.payload ?? question.payload;
  const answerKey = version?.answerKey ?? question.answerKey;
  const rubric = version?.rubric ?? question.rubric;
  const options = readOptions(payload);
  const primaryBinding = question.knowledgeBindings.find((binding) => binding.isPrimary) ?? question.knowledgeBindings[0] ?? null;

  return {
    id: question.id,
    kind: question.kind,
    stem: version?.stem ?? question.stem,
    optionA: options.A,
    optionB: options.B,
    optionC: options.C,
    optionD: options.D,
    answer: readAnswer(answerKey),
    payloadJson: formatJson(payload),
    answerKeyJson: formatJson(answerKey),
    rubricJson: formatJson(rubric),
    explanation: version?.explanation ?? question.explanation ?? "",
    difficulty: question.difficulty,
    visibility: question.visibility,
    sourceType: question.sourceType,
    sourceTitle: question.sourceTitle ?? "",
    sourceUrl: question.sourceUrl ?? "",
    sourceLicense: question.sourceLicense ?? "",
    ownerEmail: question.owner?.email ?? "",
    ownerName: question.owner?.name ?? "",
    ownership: question.owner ? "user_private" : "platform",
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
    if (isPlainObject(item) && typeof item.key === "string" && typeof item.text === "string" && item.key in empty) {
      empty[item.key as SingleChoiceAnswerKey] = item.text;
    }
  }

  return empty;
}

function readAnswer(answerKey: Prisma.JsonValue | null | undefined) {
  if (isJsonObject(answerKey) && Array.isArray(answerKey.values)) {
    return answerKey.values.map((value) => String(value)).join(",");
  }

  if (isJsonObject(answerKey) && (typeof answerKey.value === "string" || typeof answerKey.value === "number" || typeof answerKey.value === "boolean")) {
    return String(answerKey.value);
  }

  if (typeof answerKey === "string" || typeof answerKey === "number" || typeof answerKey === "boolean") {
    return String(answerKey);
  }

  return "";
}

function formatJson(value: Prisma.JsonValue | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
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

function parseOptionalJson(value: string | null | undefined, label: string): ActionResult<Prisma.InputJsonValue | null> {
  const text = value?.trim();

  if (!text) {
    return { ok: true, data: null };
  }

  try {
    const parsed = JSON.parse(text);

    if (parsed === null) {
      return { ok: true, data: null };
    }

    if (!isInputJsonValue(parsed)) {
      return { ok: false, error: `${label} 格式无效。` };
    }

    return { ok: true, data: parsed as Prisma.InputJsonValue };
  } catch {
    return { ok: false, error: `${label} 不是有效 JSON。` };
  }
}

function parseAnswerValues(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\s，、]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    )
  ];
}

function parseTrueFalseAnswer(value: string) {
  const normalized = value.trim().toLowerCase();

  if (["true", "t", "yes", "y", "1", "对", "正确"].includes(normalized)) {
    return true;
  }

  if (["false", "f", "no", "n", "0", "错", "错误"].includes(normalized)) {
    return false;
  }

  return null;
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

function answerTextValue(value: unknown) {
  return Array.isArray(value) ? value.map((item) => textValue(item)).filter(Boolean).join(",") : textValue(value);
}

function jsonTextValue(value: unknown) {
  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

function readValueFromAnswerKey(value: unknown) {
  if (!isPlainObject(value)) {
    return "";
  }

  if (Array.isArray(value.values)) {
    return value.values;
  }

  return value.value;
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

function isInputJsonValue(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => item === null || isInputJsonValue(item));
  }

  if (isPlainObject(value)) {
    return Object.values(value).every((item) => item === null || isInputJsonValue(item));
  }

  return false;
}

class QuestionAdminError extends Error {}
