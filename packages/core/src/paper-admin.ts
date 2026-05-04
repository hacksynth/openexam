import { Prisma, QuestionKind, type Visibility } from "@prisma/client";
import { validateSlug } from "./exam-core";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

export const paperVisibilityOptions = ["private", "unlisted", "public"] as const;
export const paperTypeOptions = ["sample", "mock", "past", "practice"] as const;
export const adminPaperArchiveFilters = ["active", "archived", "all"] as const;

export type AdminPaperArchiveFilter = (typeof adminPaperArchiveFilters)[number];

export type AdminPaperFilters = {
  q?: string | null;
  subjectId?: string | null;
  paperType?: string | null;
  visibility?: string | null;
  archived?: string | null;
};

export type PaperQuestionInput = {
  questionId: string;
  order: string | number;
  number?: string | null;
  section?: string | null;
  score?: string | number | null;
};

export type PaperInput = {
  title: string;
  slug: string;
  paperType?: string | null;
  visibility?: string | null;
  subjectId: string;
  questions: PaperQuestionInput[];
};

type ParsedPaperInput = {
  title: string;
  slug: string;
  paperType: string;
  visibility: (typeof paperVisibilityOptions)[number];
  subjectId: string;
  questions: {
    questionId: string;
    order: number;
    number: string;
    section: string | null;
    score: number;
  }[];
};

const adminPaperInclude = {
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
  },
  cycle: {
    include: {
      track: {
        include: {
          program: true
        }
      }
    }
  },
  questions: {
    orderBy: {
      order: "asc"
    },
    include: {
      question: true
    }
  }
} satisfies Prisma.PaperInclude;

type AdminPaperRecord = Prisma.PaperGetPayload<{ include: typeof adminPaperInclude }>;

export function validatePaperInput(input: PaperInput) {
  return parsePaperInput(input);
}

export function normalizeAdminPaperFilters(filters: AdminPaperFilters = {}) {
  return {
    q: optionalText(filters.q),
    subjectId: optionalText(filters.subjectId),
    paperType: parseFilterEnum(filters.paperType, paperTypeOptions),
    visibility: parseFilterEnum(filters.visibility, paperVisibilityOptions),
    archived: parseFilterEnum(filters.archived, adminPaperArchiveFilters) ?? "active"
  };
}

export async function listAdminPapers(filters: AdminPaperFilters = {}) {
  const where = buildAdminPaperWhere(filters);
  const papers = await prisma.paper.findMany({
    where,
    include: adminPaperInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: 100
  });

  return papers.map(toAdminPaper);
}

export function buildAdminPaperWhere(filters: AdminPaperFilters = {}) {
  const normalized = normalizeAdminPaperFilters(filters);

  return {
    ...(normalized.archived === "active" ? { archivedAt: null } : {}),
    ...(normalized.archived === "archived" ? { archivedAt: { not: null } } : {}),
    ...(normalized.q
      ? {
          title: {
            contains: normalized.q,
            mode: "insensitive"
          }
        }
      : {}),
    ...(normalized.subjectId ? { subjectId: normalized.subjectId } : {}),
    ...(normalized.paperType ? { paperType: normalized.paperType } : {}),
    ...(normalized.visibility ? { visibility: normalized.visibility as Visibility } : {})
  } satisfies Prisma.PaperWhereInput;
}

export async function listAdminPaperQuestionOptions() {
  const questions = await prisma.question.findMany({
    where: {
      kind: QuestionKind.single_choice,
      deletedAt: null
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    include: {
      knowledgeBindings: {
        include: {
          knowledgeNode: true
        }
      }
    }
  });

  return questions.map((question) => ({
    id: question.id,
    stem: question.stem,
    visibility: question.visibility,
    reviewStatus: question.reviewStatus,
    difficulty: question.difficulty,
    knowledgePath: question.knowledgeBindings.map((binding) => binding.knowledgeNode.title).join(" / ") || "未绑定知识点",
    publicReady: question.visibility === "public" && question.reviewStatus === "approved"
  }));
}

export async function createPaper(input: PaperInput): Promise<ActionResult> {
  const parsed = await parsePaperInputWithDatabase(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    await prisma.paper.create({
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        paperType: parsed.data.paperType,
        visibility: parsed.data.visibility as Visibility,
        subjectId: parsed.data.subjectId,
        cycleId: parsed.data.cycleId,
        questions: {
          createMany: {
            data: parsed.data.questions
          }
        }
      }
    });

    return { ok: true };
  } catch (error) {
    return databaseError(error, "试卷创建失败。");
  }
}

export async function updatePaper(id: string, input: PaperInput): Promise<ActionResult> {
  const parsed = await parsePaperInputWithDatabase(input);

  if (!parsed.ok) {
    return parsed;
  }

  if (!id.trim()) {
    return { ok: false, error: "试卷不存在。" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const paper = await tx.paper.findUnique({
        where: { id },
        select: { id: true }
      });

      if (!paper) {
        throw new PaperAdminError("试卷不存在。");
      }

      await tx.paper.update({
        where: { id: paper.id },
        data: {
          title: parsed.data.title,
          slug: parsed.data.slug,
          paperType: parsed.data.paperType,
          visibility: parsed.data.visibility as Visibility,
          subjectId: parsed.data.subjectId,
          cycleId: parsed.data.cycleId
        }
      });

      await tx.paperQuestion.deleteMany({
        where: { paperId: paper.id }
      });
      await tx.paperQuestion.createMany({
        data: parsed.data.questions.map((question) => ({
          ...question,
          paperId: paper.id
        }))
      });
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof PaperAdminError) {
      return { ok: false, error: error.message };
    }

    return databaseError(error, "试卷更新失败。");
  }
}

export async function setPaperArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!id.trim()) {
    return { ok: false, error: "试卷不存在。" };
  }

  try {
    if (!archived) {
      const paper = await prisma.paper.findUnique({
        where: { id },
        include: {
          questions: {
            include: {
              question: true
            }
          }
        }
      });

      if (!paper) {
        return { ok: false, error: "试卷不存在。" };
      }

      const privateQuestion =
        paper.visibility === "public"
          ? paper.questions.find((paperQuestion) => paperQuestion.question.visibility !== "public" || paperQuestion.question.reviewStatus !== "approved" || paperQuestion.question.deletedAt)
          : null;

      if (privateQuestion) {
        return { ok: false, error: "恢复公开前，请先确保所有绑定题目公开且审核通过。" };
      }
    }

    const result = await prisma.paper.updateMany({
      where: { id },
      data: {
        archivedAt: archived ? new Date() : null
      }
    });

    return result.count > 0 ? { ok: true } : { ok: false, error: "试卷不存在。" };
  } catch (error) {
    return databaseError(error, archived ? "试卷隐藏失败。" : "试卷恢复失败。");
  }
}

function parsePaperInput(input: PaperInput) {
  const title = input.title.trim();
  const slug = validateSlug(input.slug);
  const visibility = parseEnum(input.visibility, paperVisibilityOptions, "private");
  const paperType = optionalText(input.paperType) ?? "sample";
  const subjectId = input.subjectId.trim();
  const questions = parsePaperQuestions(input.questions);

  if (!title) {
    return { ok: false, error: "试卷标题不能为空。" } as const;
  }

  if (!slug.ok) {
    return slug;
  }

  if (!visibility.ok) {
    return visibility;
  }

  if (!subjectId) {
    return { ok: false, error: "请选择科目。" } as const;
  }

  if (!questions.ok) {
    return questions;
  }

  return {
    ok: true,
    data: {
      title,
      slug: slug.slug,
      paperType,
      visibility: visibility.value,
      subjectId,
      questions: questions.data
    }
  } as const;
}

async function parsePaperInputWithDatabase(input: PaperInput) {
  const parsed = parsePaperInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const subject = await prisma.subject.findUnique({
    where: { id: parsed.data.subjectId },
    select: {
      id: true,
      cycleId: true
    }
  });

  if (!subject) {
    return { ok: false, error: "请选择有效的科目。" } as const;
  }

  const questionIds = parsed.data.questions.map((question) => question.questionId);
  const questions = await prisma.question.findMany({
    where: {
      id: {
        in: questionIds
      }
    },
    select: {
      id: true,
      kind: true,
      visibility: true,
      reviewStatus: true,
      deletedAt: true
    }
  });
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const missingQuestion = questionIds.find((questionId) => !questionMap.has(questionId));

  if (missingQuestion) {
    return { ok: false, error: "试卷包含不存在的题目。" } as const;
  }

  const invalidQuestion = questions.find((question) => question.kind !== QuestionKind.single_choice || question.deletedAt);

  if (invalidQuestion) {
    return { ok: false, error: "试卷只能绑定未归档的单选题。" } as const;
  }

  if (parsed.data.visibility === "public") {
    const privateQuestion = questions.find((question) => question.visibility !== "public" || question.reviewStatus !== "approved");

    if (privateQuestion) {
      return { ok: false, error: "公开试卷只能绑定公开且审核通过的题目。" } as const;
    }
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      cycleId: subject.cycleId
    }
  } as const;
}

function parsePaperQuestions(questions: PaperQuestionInput[]) {
  const selected = questions.filter((question) => question.questionId.trim());

  if (selected.length === 0) {
    return { ok: false, error: "试卷至少需要绑定 1 道题。" } as const;
  }

  const parsed = [];
  const questionIds = new Set<string>();
  const orders = new Set<number>();

  for (const question of selected) {
    const questionId = question.questionId.trim();
    const order = parsePositiveInteger(question.order);
    const score = parsePositiveNumber(question.score ?? 1);

    if (!order.ok) {
      return { ok: false, error: "题序必须是正整数。" } as const;
    }

    if (!score.ok) {
      return { ok: false, error: "分值必须是大于 0 的数字。" } as const;
    }

    if (questionIds.has(questionId)) {
      return { ok: false, error: "同一试卷不能重复绑定同一道题。" } as const;
    }

    if (orders.has(order.value)) {
      return { ok: false, error: "题序不能重复。" } as const;
    }

    questionIds.add(questionId);
    orders.add(order.value);
    parsed.push({
      questionId,
      order: order.value,
      number: optionalText(question.number) ?? String(order.value),
      section: optionalText(question.section),
      score: score.value
    });
  }

  return {
    ok: true,
    data: parsed.sort((left, right) => left.order - right.order)
  } as const;
}

function toAdminPaper(paper: AdminPaperRecord) {
  const subject = paper.subject;
  const cycle = subject?.cycle ?? paper.cycle;
  const track = cycle?.track;

  return {
    id: paper.id,
    title: paper.title,
    slug: paper.slug,
    paperType: paper.paperType,
    visibility: paper.visibility,
    archived: Boolean(paper.archivedAt),
    hasPublicRisk: paper.visibility === "public" && paper.questions.some((paperQuestion) => paperQuestion.question.visibility !== "public" || paperQuestion.question.reviewStatus !== "approved"),
    subjectId: paper.subjectId ?? "",
    cycleId: paper.cycleId ?? "",
    updatedAt: paper.updatedAt,
    subjectPath: subject && track ? `${track.program.name} / ${track.name} / ${cycle?.name} / ${subject.name}` : "未绑定科目",
    totalScore: paper.questions.reduce((sum, question) => sum + question.score, 0),
    questionCount: paper.questions.length,
    questions: paper.questions.map((paperQuestion) => ({
      questionId: paperQuestion.questionId,
      order: paperQuestion.order,
      number: paperQuestion.number,
      section: paperQuestion.section ?? "",
      score: paperQuestion.score,
      stem: paperQuestion.question.stem,
      visibility: paperQuestion.question.visibility,
      reviewStatus: paperQuestion.question.reviewStatus
    }))
  };
}

function parseEnum<const T extends readonly string[]>(value: string | null | undefined, options: T, fallback: T[number]) {
  const normalized = value?.trim() || fallback;

  if (!options.includes(normalized as T[number])) {
    return { ok: false, error: "试卷状态参数无效。" } as const;
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

function parsePositiveInteger(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false } as const;
  }

  return { ok: true, value: parsed } as const;
}

function parsePositiveNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false } as const;
  }

  return { ok: true, value: parsed } as const;
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim();

  return text ? text : null;
}

function databaseError(error: unknown, fallback: string): ActionResult {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return { ok: false, error: "试卷 Slug 已存在。" };
    }

    return { ok: false, error: `${fallback} (${error.code})` };
  }

  return { ok: false, error: fallback };
}

class PaperAdminError extends Error {}
