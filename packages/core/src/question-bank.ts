import { Prisma, type QuestionKind, type SourceType } from "@prisma/client";
import { prisma } from "./prisma";

const userQuestionBankInclude = {
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

type UserQuestionBankRecord = Prisma.QuestionGetPayload<{ include: typeof userQuestionBankInclude }>;

export const userQuestionBankSourceFilters = ["all", "user_uploaded", "ai_generated"] as const;

export type UserQuestionBankSourceFilter = (typeof userQuestionBankSourceFilters)[number];

export type UserQuestionBankFilters = {
  sourceType?: string | null;
  materialId?: string | null;
};

export type UserQuestionBankItem = {
  id: string;
  kind: QuestionKind;
  stem: string;
  sourceType: SourceType;
  sourceTitle: string;
  sourceLicense: string;
  difficulty: number | null;
  reviewStatus: string;
  knowledgePath: string;
  materialId: string | null;
  materialTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listUserQuestionBank(userId: string, filters: UserQuestionBankFilters = {}, db = prisma) {
  const sourceType = parseSourceFilter(filters.sourceType);
  const materialId = optionalText(filters.materialId);
  const material = materialId
    ? await db.material.findFirst({
        where: {
          id: materialId,
          ownerId: userId,
          libraryScope: "personal"
        },
        include: {
          candidates: {
            where: {
              status: "confirmed",
              confirmedQuestionId: {
                not: null
              }
            },
            select: {
              confirmedQuestionId: true
            }
          }
        }
      })
    : null;
  const materialQuestionIds = material ? compactIds(material.candidates.map((candidate) => candidate.confirmedQuestionId)) : null;

  const questions = await db.question.findMany({
    where: {
      ownerId: userId,
      visibility: "private",
      deletedAt: null,
      ...(sourceType === "all" ? {} : { sourceType: sourceType as SourceType }),
      ...(materialQuestionIds ? { id: { in: materialQuestionIds } } : {})
    },
    include: userQuestionBankInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: 100
  });
  const materialMap = await mapMaterialQuestions(questions.map((question) => question.id), userId, db);

  return {
    sourceType,
    material: material
      ? {
          id: material.id,
          title: material.title
        }
      : null,
    materialUnavailable: Boolean(materialId && !material),
    questions: questions.map((question) => toUserQuestionBankItem(question, materialMap.get(question.id) ?? null))
  };
}

async function mapMaterialQuestions(questionIds: string[], userId: string, db: typeof prisma) {
  if (questionIds.length === 0) {
    return new Map<string, { id: string; title: string }>();
  }

  const candidates = await db.materialQuestionCandidate.findMany({
    where: {
      confirmedQuestionId: {
        in: questionIds
      },
      material: {
        ownerId: userId,
        libraryScope: "personal"
      }
    },
    include: {
      material: true
    }
  });

  const byQuestion = new Map<string, { id: string; title: string }>();

  for (const candidate of candidates) {
    if (candidate.confirmedQuestionId) {
      byQuestion.set(candidate.confirmedQuestionId, {
        id: candidate.material.id,
        title: candidate.material.title
      });
    }
  }

  return byQuestion;
}

function toUserQuestionBankItem(question: UserQuestionBankRecord, material: { id: string; title: string } | null): UserQuestionBankItem {
  const version = question.versions.find((item) => item.version === question.currentVersion) ?? question.versions[0] ?? null;
  const primaryBinding = question.knowledgeBindings.find((binding) => binding.isPrimary) ?? question.knowledgeBindings[0] ?? null;

  return {
    id: question.id,
    kind: question.kind,
    stem: version?.stem ?? question.stem,
    sourceType: question.sourceType,
    sourceTitle: question.sourceTitle ?? "",
    sourceLicense: question.sourceLicense ?? "",
    difficulty: question.difficulty ?? null,
    reviewStatus: question.reviewStatus,
    knowledgePath: primaryBinding ? formatKnowledgePath(primaryBinding.knowledgeNode) : "未绑定知识点",
    materialId: material?.id ?? null,
    materialTitle: material?.title ?? null,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt
  };
}

function parseSourceFilter(value: string | null | undefined): UserQuestionBankSourceFilter {
  return userQuestionBankSourceFilters.includes(value as UserQuestionBankSourceFilter) ? (value as UserQuestionBankSourceFilter) : "all";
}

function formatKnowledgePath(node: UserQuestionBankRecord["knowledgeBindings"][number]["knowledgeNode"]) {
  return [
    node.syllabus.subject.cycle.track.program.name,
    node.syllabus.subject.cycle.track.name,
    node.syllabus.subject.cycle.name,
    node.syllabus.subject.name,
    node.title
  ].join(" / ");
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim();

  return text || null;
}

function compactIds(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value));
}
