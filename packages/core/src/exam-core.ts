import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type PrimaryGoalTx = Pick<typeof prisma, "examProgram" | "examTrack" | "examCycle" | "subject" | "examGoal">;
type PrimaryGoalDb = {
  $transaction<T>(callback: (tx: PrimaryGoalTx) => Promise<T>): Promise<T>;
};

type ParsedGoalInput = {
  programId: string;
  trackId: string | null;
  cycleId: string | null;
  subjectId: string | null;
  targetDate: Date | null;
  targetScore: number | null;
  dailyMinutes: number;
};

export type ExamHierarchy = Awaited<ReturnType<typeof listExamHierarchy>>;
export type KnowledgeHierarchy = Awaited<ReturnType<typeof listKnowledgeHierarchy>>;
export type PrimaryGoal = Awaited<ReturnType<typeof getPrimaryExamGoal>>;

export type ExamGoalInput = {
  programId: string;
  trackId?: string | null;
  cycleId?: string | null;
  subjectId?: string | null;
  targetDate?: string | null;
  targetScore?: string | number | null;
  dailyMinutes?: string | number | null;
};

export function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

export function validateSlug(value: string) {
  const slug = normalizeSlug(value);

  if (!slug) {
    return { ok: false, error: "Slug 不能为空。" } as const;
  }

  if (!slugPattern.test(slug)) {
    return { ok: false, error: "Slug 只能使用小写字母、数字和连字符，且不能以连字符开头或结尾。" } as const;
  }

  return { ok: true, slug } as const;
}

export function formatDateInput(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function formatGoalPath(goal: NonNullable<PrimaryGoal>) {
  return [goal.program.name, goal.track?.name, goal.cycle?.name, goal.subject?.name].filter(Boolean).join(" / ");
}

export async function listExamHierarchy() {
  return prisma.examProgram.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      tracks: {
        orderBy: [{ name: "asc" }],
        include: {
          cycles: {
            orderBy: [{ name: "desc" }],
            include: {
              subjects: {
                orderBy: [{ name: "asc" }]
              }
            }
          }
        }
      }
    }
  });
}

export async function listKnowledgeHierarchy() {
  return prisma.subject.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      cycle: {
        include: {
          track: {
            include: {
              program: true
            }
          }
        }
      },
      syllabi: {
        orderBy: [{ name: "asc" }],
        include: {
          knowledgeNodes: {
            orderBy: [{ code: "asc" }, { title: "asc" }]
          }
        }
      }
    }
  });
}

export async function getPrimaryExamGoal(userId: string) {
  return prisma.examGoal.findFirst({
    where: { userId, isPrimary: true },
    include: {
      program: true,
      track: true,
      cycle: true,
      subject: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });
}

export async function createExamProgram(input: { name: string; slug: string; description?: string | null }) {
  const parsed = parseNamedSlug(input.name, input.slug);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    await prisma.examProgram.create({
      data: {
        ...parsed.data,
        description: optionalText(input.description)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "考试项目创建失败。");
  }
}

export async function updateExamProgram(input: { id: string; name: string; slug: string; description?: string | null }) {
  const parsed = parseNamedSlug(input.name, input.slug);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    await prisma.examProgram.update({
      where: { id: input.id },
      data: {
        ...parsed.data,
        description: optionalText(input.description)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "考试项目更新失败。");
  }
}

export async function createExamTrack(input: { programId: string; name: string; slug: string; level?: string | null }) {
  const parsed = parseNamedSlug(input.name, input.slug);

  if (!parsed.ok) {
    return parsed;
  }

  if (!requiredId(input.programId)) {
    return { ok: false, error: "请选择考试项目。" } satisfies ActionResult;
  }

  try {
    await prisma.examTrack.create({
      data: {
        programId: input.programId,
        ...parsed.data,
        level: optionalText(input.level)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "考试方向创建失败。");
  }
}

export async function updateExamTrack(input: { id: string; name: string; slug: string; level?: string | null }) {
  const parsed = parseNamedSlug(input.name, input.slug);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    await prisma.examTrack.update({
      where: { id: input.id },
      data: {
        ...parsed.data,
        level: optionalText(input.level)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "考试方向更新失败。");
  }
}

export async function createExamCycle(input: {
  trackId: string;
  name: string;
  slug: string;
  startsAt?: string | null;
  examDate?: string | null;
}) {
  const parsed = parseNamedSlug(input.name, input.slug);
  const startsAt = parseDate(input.startsAt, "开始日期");
  const examDate = parseDate(input.examDate, "考试日期");

  if (!parsed.ok) {
    return parsed;
  }

  if (!startsAt.ok) {
    return startsAt;
  }

  if (!examDate.ok) {
    return examDate;
  }

  if (!requiredId(input.trackId)) {
    return { ok: false, error: "请选择考试方向。" } satisfies ActionResult;
  }

  try {
    await prisma.examCycle.create({
      data: {
        trackId: input.trackId,
        ...parsed.data,
        startsAt: startsAt.value,
        examDate: examDate.value
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "考试批次创建失败。");
  }
}

export async function updateExamCycle(input: {
  id: string;
  name: string;
  slug: string;
  startsAt?: string | null;
  examDate?: string | null;
}) {
  const parsed = parseNamedSlug(input.name, input.slug);
  const startsAt = parseDate(input.startsAt, "开始日期");
  const examDate = parseDate(input.examDate, "考试日期");

  if (!parsed.ok) {
    return parsed;
  }

  if (!startsAt.ok) {
    return startsAt;
  }

  if (!examDate.ok) {
    return examDate;
  }

  try {
    await prisma.examCycle.update({
      where: { id: input.id },
      data: {
        ...parsed.data,
        startsAt: startsAt.value,
        examDate: examDate.value
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "考试批次更新失败。");
  }
}

export async function createSubject(input: {
  cycleId: string;
  name: string;
  slug: string;
  description?: string | null;
}) {
  const parsed = parseNamedSlug(input.name, input.slug);

  if (!parsed.ok) {
    return parsed;
  }

  if (!requiredId(input.cycleId)) {
    return { ok: false, error: "请选择考试批次。" } satisfies ActionResult;
  }

  try {
    await prisma.subject.create({
      data: {
        cycleId: input.cycleId,
        ...parsed.data,
        description: optionalText(input.description)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "科目创建失败。");
  }
}

export async function updateSubject(input: {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}) {
  const parsed = parseNamedSlug(input.name, input.slug);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    await prisma.subject.update({
      where: { id: input.id },
      data: {
        ...parsed.data,
        description: optionalText(input.description)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "科目更新失败。");
  }
}

export async function createSyllabus(input: { subjectId: string; name: string; version: string }) {
  const name = requiredText(input.name, "大纲名称");
  const version = requiredText(input.version, "版本");

  if (!name.ok) {
    return name;
  }

  if (!version.ok) {
    return version;
  }

  if (!requiredId(input.subjectId)) {
    return { ok: false, error: "请选择科目。" } satisfies ActionResult;
  }

  try {
    await prisma.syllabus.create({
      data: {
        subjectId: input.subjectId,
        name: name.value,
        version: version.value
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "大纲创建失败。");
  }
}

export async function updateSyllabus(input: { id: string; name: string; version: string }) {
  const name = requiredText(input.name, "大纲名称");
  const version = requiredText(input.version, "版本");

  if (!name.ok) {
    return name;
  }

  if (!version.ok) {
    return version;
  }

  try {
    await prisma.syllabus.update({
      where: { id: input.id },
      data: {
        name: name.value,
        version: version.value
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "大纲更新失败。");
  }
}

export async function createKnowledgeNode(input: {
  syllabusId: string;
  parentId?: string | null;
  code?: string | null;
  title: string;
  description?: string | null;
  examExpectation?: string | null;
}) {
  const title = requiredText(input.title, "知识点标题");

  if (!title.ok) {
    return title;
  }

  if (!requiredId(input.syllabusId)) {
    return { ok: false, error: "请选择大纲。" } satisfies ActionResult;
  }

  try {
    const parentId = optionalText(input.parentId);

    if (parentId) {
      const parent = await prisma.knowledgeNode.findUnique({
        where: { id: parentId },
        select: { syllabusId: true }
      });

      if (!parent || parent.syllabusId !== input.syllabusId) {
        return { ok: false, error: "父级知识点必须属于同一个大纲。" } satisfies ActionResult;
      }
    }

    await prisma.knowledgeNode.create({
      data: {
        syllabusId: input.syllabusId,
        parentId,
        code: optionalText(input.code),
        title: title.value,
        description: optionalText(input.description),
        examExpectation: optionalText(input.examExpectation)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "知识点创建失败。");
  }
}

export async function updateKnowledgeNode(input: {
  id: string;
  parentId?: string | null;
  code?: string | null;
  title: string;
  description?: string | null;
  examExpectation?: string | null;
}) {
  const title = requiredText(input.title, "知识点标题");

  if (!title.ok) {
    return title;
  }

  try {
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: input.id },
      select: { syllabusId: true }
    });

    if (!node) {
      return { ok: false, error: "知识点不存在。" } satisfies ActionResult;
    }

    const parentId = optionalText(input.parentId);

    if (parentId) {
      if (parentId === input.id) {
        return { ok: false, error: "知识点不能把自己设为父级。" } satisfies ActionResult;
      }

      const parent = await prisma.knowledgeNode.findUnique({
        where: { id: parentId },
        select: { syllabusId: true, parentId: true }
      });

      if (!parent || parent.syllabusId !== node.syllabusId) {
        return { ok: false, error: "父级知识点必须属于同一个大纲。" } satisfies ActionResult;
      }

      if (await isKnowledgeDescendant(input.id, parentId)) {
        return { ok: false, error: "父级知识点不能是当前知识点的下级。" } satisfies ActionResult;
      }
    }

    await prisma.knowledgeNode.update({
      where: { id: input.id },
      data: {
        parentId,
        code: optionalText(input.code),
        title: title.value,
        description: optionalText(input.description),
        examExpectation: optionalText(input.examExpectation)
      }
    });
    return { ok: true } satisfies ActionResult;
  } catch (error) {
    return databaseError(error, "知识点更新失败。");
  }
}

export async function savePrimaryExamGoal(userId: string, input: ExamGoalInput, db: PrimaryGoalDb = prisma) {
  const parsed = parseGoalInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  return db.$transaction(async (tx) => {
    const hierarchy = await validateGoalHierarchy(tx, parsed.data);

    if (!hierarchy.ok) {
      return hierarchy;
    }

    const existingPrimary = await tx.examGoal.findFirst({
      where: { userId, isPrimary: true },
      select: { id: true }
    });

    await tx.examGoal.updateMany({
      where: {
        userId,
        isPrimary: true,
        ...(existingPrimary ? { id: { not: existingPrimary.id } } : {})
      },
      data: { isPrimary: false }
    });

    const data = {
      userId,
      programId: parsed.data.programId,
      trackId: parsed.data.trackId,
      cycleId: parsed.data.cycleId,
      subjectId: parsed.data.subjectId,
      targetDate: parsed.data.targetDate,
      targetScore: parsed.data.targetScore,
      dailyMinutes: parsed.data.dailyMinutes,
      isPrimary: true
    };

    if (existingPrimary) {
      await tx.examGoal.update({
        where: { id: existingPrimary.id },
        data
      });
    } else {
      await tx.examGoal.create({ data });
    }

    return { ok: true } satisfies ActionResult;
  });
}

function parseNamedSlug(nameValue: string, slugValue: string) {
  const name = requiredText(nameValue, "名称");
  const slug = validateSlug(slugValue);

  if (!name.ok) {
    return { ok: false, error: name.error } as const;
  }

  if (!slug.ok) {
    return { ok: false, error: slug.error } as const;
  }

  return { ok: true, data: { name: name.value, slug: slug.slug } } as const;
}

function parseGoalInput(input: ExamGoalInput): { ok: true; data: ParsedGoalInput } | { ok: false; error: string } {
  const programId = optionalText(input.programId);

  if (!programId) {
    return { ok: false, error: "请选择考试项目。" } as const;
  }

  const targetDate = parseDate(input.targetDate, "目标日期");
  const targetScore = parseOptionalNumber(input.targetScore, "目标分");
  const dailyMinutes = parseDailyMinutes(input.dailyMinutes);

  if (!targetDate.ok) {
    return targetDate;
  }

  if (!targetScore.ok) {
    return targetScore;
  }

  if (!dailyMinutes.ok) {
    return dailyMinutes;
  }

  return {
    ok: true,
    data: {
      programId,
      trackId: optionalText(input.trackId),
      cycleId: optionalText(input.cycleId),
      subjectId: optionalText(input.subjectId),
      targetDate: targetDate.value,
      targetScore: targetScore.value,
      dailyMinutes: dailyMinutes.value
    }
  } as const;
}

async function validateGoalHierarchy(tx: PrimaryGoalTx, input: ParsedGoalInput) {
  const program = await tx.examProgram.findUnique({ where: { id: input.programId }, select: { id: true } });

  if (!program) {
    return { ok: false, error: "考试项目不存在。" } satisfies ActionResult;
  }

  if (input.trackId) {
    const track = await tx.examTrack.findUnique({
      where: { id: input.trackId },
      select: { programId: true }
    });

    if (!track || track.programId !== input.programId) {
      return { ok: false, error: "考试方向与考试项目不匹配。" } satisfies ActionResult;
    }
  }

  if (input.cycleId) {
    const cycle = await tx.examCycle.findUnique({
      where: { id: input.cycleId },
      select: { trackId: true }
    });

    if (!cycle || !input.trackId || cycle.trackId !== input.trackId) {
      return { ok: false, error: "考试批次与考试方向不匹配。" } satisfies ActionResult;
    }
  }

  if (input.subjectId) {
    const subject = await tx.subject.findUnique({
      where: { id: input.subjectId },
      select: { cycleId: true }
    });

    if (!subject || !input.cycleId || subject.cycleId !== input.cycleId) {
      return { ok: false, error: "科目与考试批次不匹配。" } satisfies ActionResult;
    }
  }

  return { ok: true } satisfies ActionResult;
}

async function isKnowledgeDescendant(id: string, possibleDescendantId: string) {
  let cursor: string | null = possibleDescendantId;

  while (cursor) {
    const node: { parentId: string | null } | null = await prisma.knowledgeNode.findUnique({
      where: { id: cursor },
      select: { parentId: true }
    });

    if (!node) {
      return false;
    }

    if (node.parentId === id) {
      return true;
    }

    cursor = node.parentId;
  }

  return false;
}

function parseDate(value: string | null | undefined, label: string) {
  const text = optionalText(value);

  if (!text) {
    return { ok: true, value: null } as const;
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `${label}格式不正确。` } as const;
  }

  return { ok: true, value: date } as const;
}

function parseOptionalNumber(value: string | number | null | undefined, label: string) {
  const text = optionalText(value);

  if (!text) {
    return { ok: true, value: null } as const;
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: `${label}必须是非负数字。` } as const;
  }

  return { ok: true, value: parsed } as const;
}

function parseDailyMinutes(value: string | number | null | undefined) {
  const text = optionalText(value);

  if (!text) {
    return { ok: true, value: 60 } as const;
  }

  const parsed = Number.parseInt(text, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 600) {
    return { ok: false, error: "每日学习时间必须在 1 到 600 分钟之间。" } as const;
  }

  return { ok: true, value: parsed } as const;
}

function requiredText(value: string | null | undefined, label: string) {
  const text = optionalText(value);

  if (!text) {
    return { ok: false, error: `${label}不能为空。` } as const;
  }

  return { ok: true, value: text } as const;
}

function optionalText(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();

  return text || null;
}

function requiredId(value: string | null | undefined) {
  return Boolean(optionalText(value));
}

function databaseError(error: unknown, fallback: string): ActionResult {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return { ok: false, error: "Slug 或版本已存在，请换一个值。" };
    }

    if (error.code === "P2025") {
      return { ok: false, error: "要更新的数据不存在。" };
    }
  }

  return { ok: false, error: fallback };
}
