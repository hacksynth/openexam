import { Prisma } from "@prisma/client";
import { getPrimaryExamGoal, type PrimaryGoal } from "./exam-core";
import { gradeObjectiveAnswer } from "./grading";
import { prisma } from "./prisma";

const practiceQuestionInclude = {
  knowledgeBindings: {
    include: {
      knowledgeNode: true
    }
  },
  paperLinks: {
    orderBy: {
      order: "asc"
    },
    take: 1
  },
  versions: {
    orderBy: {
      version: "desc"
    },
    take: 1
  }
} satisfies Prisma.QuestionInclude;

type PracticeQuestionRecord = Prisma.QuestionGetPayload<{ include: typeof practiceQuestionInclude }>;
type PracticeDatabase = typeof prisma;

export type SingleChoiceOption = {
  key: string;
  text: string;
};

export type PracticeQuestion = {
  id: string;
  stem: string;
  options: SingleChoiceOption[];
  difficulty: number | null;
  knowledgeNodes: string[];
  sourceType: string;
};

export type PracticeMaterialContext = {
  id: string;
  title: string;
};

export type MaterialPracticeEmptyReason = "general" | "material_unavailable" | "material_goal_mismatch";

export type PracticeQuestionState =
  | { status: "no_goal"; material?: PracticeMaterialContext }
  | { status: "error"; goal: NonNullable<PrimaryGoal>; error: string; material?: PracticeMaterialContext }
  | { status: "empty"; goal: NonNullable<PrimaryGoal>; material?: PracticeMaterialContext; emptyReason?: MaterialPracticeEmptyReason }
  | { status: "ready"; goal: NonNullable<PrimaryGoal>; question: PracticeQuestion; material?: PracticeMaterialContext };

export type PracticeSubmitResult =
  | { ok: true; attemptId: string; isCorrect: boolean }
  | { ok: false; error: string };

export type PracticeQuestionOptions = {
  excludeQuestionId?: string | null;
  retryQuestionId?: string | null;
  materialId?: string | null;
  knowledgeNodeId?: string | null;
};

export type MaterialPracticeScope = {
  material: PracticeMaterialContext;
  questionIds: string[];
};

export function readSingleChoiceOptions(payload: Prisma.JsonValue | null | undefined) {
  if (!isJsonObject(payload) || !Array.isArray(payload.options)) {
    return null;
  }

  const options = payload.options.map((item) => {
    if (!isJsonObject(item) || typeof item.key !== "string" || typeof item.text !== "string") {
      return null;
    }

    return {
      key: item.key.trim(),
      text: item.text.trim()
    };
  });

  if (options.some((option) => !option)) {
    return null;
  }

  const normalized = options.filter((option): option is SingleChoiceOption => Boolean(option));

  return normalized.length > 0 ? normalized : null;
}

export function readSingleChoiceAnswerKey(answerKey: Prisma.JsonValue | null | undefined) {
  if (typeof answerKey === "string" || typeof answerKey === "number" || typeof answerKey === "boolean") {
    return String(answerKey).trim();
  }

  if (isJsonObject(answerKey) && typeof answerKey.value === "string") {
    return answerKey.value.trim();
  }

  return null;
}

export function gradeSingleChoiceQuestion(input: { answerKey: Prisma.JsonValue | null | undefined; response: string; maxScore?: number }) {
  const answerKey = readSingleChoiceAnswerKey(input.answerKey);

  if (!answerKey) {
    return { ok: false, error: "题目答案配置不完整。" } as const;
  }

  return {
    ok: true,
    result: gradeObjectiveAnswer("single_choice", answerKey, input.response, input.maxScore ?? 1),
    correctAnswer: answerKey
  } as const;
}

export async function getPracticeQuestion(userId: string, options: PracticeQuestionOptions = {}): Promise<PracticeQuestionState> {
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { status: "no_goal" };
  }

  if (options.retryQuestionId) {
    const retryQuestion = await getRetryQuestion(userId, goal, options.retryQuestionId);

    if (!retryQuestion) {
      return { status: "error", goal, error: "错题不存在，或不在当前考试目标范围内。" };
    }

    const normalizedRetry = toPracticeQuestion(retryQuestion);

    if (!normalizedRetry) {
      return { status: "error", goal, error: "题目选项配置不完整。" };
    }

    return { status: "ready", goal, question: normalizedRetry };
  }

  const materialScope = await getMaterialPracticeScope(userId, options.materialId);

  if (options.materialId && (!materialScope || materialScope.questionIds.length === 0)) {
    return {
      status: "empty",
      goal,
      material: materialScope?.material,
      emptyReason: "material_unavailable"
    };
  }

  const question = await selectPracticeQuestion(userId, goal, options.excludeQuestionId, materialScope?.questionIds, options.knowledgeNodeId);

  if (!question) {
    return {
      status: "empty",
      goal,
      material: materialScope?.material,
      emptyReason: materialScope ? "material_goal_mismatch" : "general"
    };
  }

  const normalized = toPracticeQuestion(question);

  if (!normalized) {
    return {
      status: "empty",
      goal,
      material: materialScope?.material,
      emptyReason: materialScope ? "material_goal_mismatch" : "general"
    };
  }

  return { status: "ready", goal, question: normalized, material: materialScope?.material };
}

export async function submitSingleChoiceAnswer(
  userId: string,
  input: { questionId: string; answer: string; retry?: boolean; materialId?: string | null }
): Promise<PracticeSubmitResult> {
  const answer = input.answer.trim();
  const questionId = input.questionId.trim();

  if (!answer) {
    return { ok: false, error: "请选择一个答案。" };
  }

  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { ok: false, error: "请先设置考试目标。" };
  }

  if (input.materialId && !(await questionBelongsToMaterialPracticeScope(userId, input.materialId, questionId))) {
    return { ok: false, error: "题目不存在或不在当前资料范围内。" };
  }

  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      ...buildPracticeQuestionWhere(userId, goal)
    },
    include: practiceQuestionInclude
  });

  if (!question) {
    return { ok: false, error: "题目不存在或不在当前目标范围内。" };
  }

  const normalized = toPracticeQuestion(question);

  if (!normalized) {
    return { ok: false, error: "题目选项配置不完整。" };
  }

  const currentVersion = question.versions.find((version) => version.version === question.currentVersion) ?? question.versions[0] ?? null;
  const grading = gradeSingleChoiceQuestion({
    answerKey: currentVersion?.answerKey ?? question.answerKey,
    response: answer,
    maxScore: question.paperLinks[0]?.score ?? 1
  });

  if (!grading.ok) {
    return grading;
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.create({
      data: {
        userId,
        goalId: goal.id,
        status: "graded",
        submittedAt: now,
        totalScore: grading.result.score,
        maxScore: grading.result.maxScore
      }
    });

    const attemptAnswer = await tx.attemptAnswer.create({
      data: {
        attemptId: attempt.id,
        questionId: question.id,
        questionVersionId: currentVersion?.id ?? null,
        userAnswer: { value: answer },
        isCorrect: grading.result.isCorrect,
        score: grading.result.score,
        maxScore: grading.result.maxScore
      }
    });

    await syncWrongNoteForObjectiveAnswer(tx, {
      userId,
      questionId: question.id,
      attemptAnswerId: attemptAnswer.id,
      isCorrect: grading.result.isCorrect,
      masteredOnCorrect: input.retry === true,
      reviewedAt: now
    });

    return {
      attemptId: attempt.id,
      isCorrect: grading.result.isCorrect
    };
  });

  return { ok: true, ...result };
}

export async function getAttemptResult(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      answers: {
        include: {
          question: {
            include: {
              knowledgeBindings: {
                include: {
                  knowledgeNode: true
                }
              }
            }
          },
          questionVersion: true
        }
      }
    }
  });

  if (!attempt || attempt.answers.length === 0) {
    return null;
  }

  const answer = attempt.answers[0];
  const answerKey = answer.questionVersion?.answerKey ?? answer.question.answerKey;

  return {
    id: attempt.id,
    isCorrect: Boolean(answer.isCorrect),
    score: answer.score ?? 0,
    maxScore: answer.maxScore ?? 1,
    userAnswer: readSubmittedAnswer(answer.userAnswer),
    correctAnswer: readSingleChoiceAnswerKey(answerKey),
    explanation: answer.questionVersion?.explanation ?? answer.question.explanation,
    question: {
      id: answer.question.id,
      stem: answer.questionVersion?.stem ?? answer.question.stem,
      options: readSingleChoiceOptions(answer.questionVersion?.payload ?? answer.question.payload) ?? [],
      knowledgeNodes: answer.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
    }
  };
}

export async function listAttempts(userId: string) {
  const attempts = await prisma.attempt.findMany({
    where: { userId },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    include: {
      answers: {
        include: {
          question: {
            include: {
              knowledgeBindings: {
                include: {
                  knowledgeNode: true
                }
              }
            }
          },
          questionVersion: true
        },
        orderBy: [{ createdAt: "asc" }]
      },
      goal: {
        include: {
          program: true,
          track: true,
          cycle: true,
          subject: true
        }
      },
      paper: true
    },
    take: 50
  });

  return attempts.map((attempt) => ({
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    totalScore: attempt.totalScore ?? 0,
    maxScore: attempt.maxScore ?? 0,
    kind: attempt.paperId ? "paper" : "practice",
    paperTitle: attempt.paper?.title ?? null,
    goalPath: attempt.goal ? [attempt.goal.program.name, attempt.goal.track?.name, attempt.goal.cycle?.name, attempt.goal.subject?.name].filter(Boolean).join(" / ") : "未绑定目标",
    answers: attempt.answers.map((answer) => {
      const answerKey = answer.questionVersion?.answerKey ?? answer.question.answerKey;

      return {
        id: answer.id,
        questionId: answer.question.id,
        isCorrect: Boolean(answer.isCorrect),
        score: answer.score ?? 0,
        maxScore: answer.maxScore ?? 0,
        userAnswer: readSubmittedAnswer(answer.userAnswer),
        correctAnswer: readSingleChoiceAnswerKey(answerKey),
        explanation: answer.questionVersion?.explanation ?? answer.question.explanation,
        question: {
          id: answer.question.id,
          stem: answer.questionVersion?.stem ?? answer.question.stem,
          knowledgeNodes: answer.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
        }
      };
    })
  }));
}

export type WrongNoteFilters = {
  mastered?: boolean;
  knowledgeNodeId?: string | null;
  questionKind?: string | null;
  minErrorCount?: string | number | null;
  updatedSince?: Date | null;
};

export async function listWrongNotes(userId: string, options: WrongNoteFilters = {}) {
  const minErrorCount = parsePositiveInteger(options.minErrorCount);
  const notes = await prisma.wrongNote.findMany({
    where: {
      userId,
      ...(typeof options.mastered === "boolean" ? { mastered: options.mastered } : {}),
      ...(typeof minErrorCount === "number" ? { errorCount: { gte: minErrorCount } } : {}),
      ...(options.updatedSince ? { updatedAt: { gte: options.updatedSince } } : {}),
      question: {
        ...(options.questionKind ? { kind: options.questionKind as never } : {}),
        ...(options.knowledgeNodeId
          ? {
              knowledgeBindings: {
                some: {
                  knowledgeNodeId: options.knowledgeNodeId
                }
              }
            }
          : {})
      }
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      question: {
        include: {
          knowledgeBindings: {
            include: {
              knowledgeNode: true
            }
          },
          versions: {
            orderBy: { version: "desc" },
            take: 1
          }
        }
      }
    }
  });

  return notes.map((note) => ({
    id: note.id,
    questionId: note.questionId,
    mastered: note.mastered,
    mistakeTags: note.mistakeTags,
    userNotes: note.userNotes,
    manualCollectedAt: note.manualCollectedAt,
    errorCount: note.errorCount,
    updatedAt: note.updatedAt,
    aiAnalysis: note.aiAnalysis,
    stem: note.question.versions[0]?.stem ?? note.question.stem,
    explanation: note.question.versions[0]?.explanation ?? note.question.explanation,
    correctAnswer: readSingleChoiceAnswerKey(note.question.versions[0]?.answerKey ?? note.question.answerKey),
    knowledgeNodes: note.question.knowledgeBindings.map((binding) => ({
      id: binding.knowledgeNodeId,
      title: binding.knowledgeNode.title
    }))
  }));
}

export async function syncWrongNoteForObjectiveAnswer(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    questionId: string;
    attemptAnswerId: string;
    isCorrect: boolean;
    masteredOnCorrect?: boolean;
    reviewedAt: Date;
  }
) {
  if (!input.isCorrect) {
    await tx.wrongNote.upsert({
      where: {
        userId_questionId: {
          userId: input.userId,
          questionId: input.questionId
        }
      },
      update: {
        attemptAnswerId: input.attemptAnswerId,
        errorCount: { increment: 1 },
        mastered: false,
        lastReviewedAt: null
      },
      create: {
        userId: input.userId,
        questionId: input.questionId,
        attemptAnswerId: input.attemptAnswerId
      }
    });

    return;
  }

  if (input.masteredOnCorrect) {
    await tx.wrongNote.updateMany({
      where: {
        userId: input.userId,
        questionId: input.questionId
      },
      data: {
        mastered: true,
        lastReviewedAt: input.reviewedAt
      }
    });
  }
}

export async function setWrongNoteMastered(userId: string, wrongNoteId: string, mastered: boolean) {
  const result = await prisma.wrongNote.updateMany({
    where: { id: wrongNoteId, userId },
    data: {
      mastered,
      lastReviewedAt: mastered ? new Date() : null
    }
  });

  return result.count > 0 ? ({ ok: true } as const) : ({ ok: false, error: "错题不存在。" } as const);
}

export async function updateWrongNoteReflection(
  userId: string,
  input: {
    wrongNoteId: string;
    mistakeTags?: string | null;
    userNotes?: string | null;
  }
) {
  const tags = parseTags(input.mistakeTags);
  const result = await prisma.wrongNote.updateMany({
    where: { id: input.wrongNoteId.trim(), userId },
    data: {
      mistakeTags: tags,
      userNotes: optionalText(input.userNotes)
    }
  });

  return result.count > 0 ? ({ ok: true } as const) : ({ ok: false, error: "错题不存在。" } as const);
}

export async function collectQuestionForReview(
  userId: string,
  input: {
    questionId: string;
    attemptAnswerId?: string | null;
  }
) {
  const questionId = input.questionId.trim();

  if (!questionId) {
    return { ok: false, error: "题目不存在。" } as const;
  }

  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      deletedAt: null
    },
    select: {
      id: true
    }
  });

  if (!question) {
    return { ok: false, error: "题目不存在。" } as const;
  }

  const now = new Date();

  await prisma.wrongNote.upsert({
    where: {
      userId_questionId: {
        userId,
        questionId
      }
    },
    update: {
      attemptAnswerId: input.attemptAnswerId?.trim() || undefined,
      manualCollectedAt: now,
      mastered: false
    },
    create: {
      userId,
      questionId,
      attemptAnswerId: input.attemptAnswerId?.trim() || null,
      errorCount: 0,
      manualCollectedAt: now
    }
  });

  return { ok: true } as const;
}

export async function getDashboardPracticeSummary(userId: string) {
  const wrongNotes = await prisma.wrongNote.findMany({
    where: {
      userId,
      mastered: false
    },
    include: {
      question: {
        include: {
          knowledgeBindings: {
            include: {
              knowledgeNode: true
            }
          }
        }
      }
    }
  });

  return summarizeWrongNotes(
    wrongNotes.map((note) => ({
      mastered: note.mastered,
      knowledgeNodes: note.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
    }))
  );
}

export function summarizeWrongNotes(notes: { mastered: boolean; knowledgeNodes: string[] }[]) {
  const pending = notes.filter((note) => !note.mastered);
  const counts = new Map<string, number>();

  for (const note of pending) {
    for (const title of note.knowledgeNodes) {
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
  }

  return {
    pendingWrongNotes: pending.length,
    weakKnowledgeNodes: [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }))
  };
}

async function getRetryQuestion(userId: string, goal: NonNullable<PrimaryGoal>, questionId: string) {
  const wrongNote = await prisma.wrongNote.findUnique({
    where: {
      userId_questionId: {
        userId,
        questionId
      }
    },
    select: {
      questionId: true
    }
  });

  if (!wrongNote) {
    return null;
  }

  return prisma.question.findFirst({
    where: {
      AND: [
        buildPracticeQuestionWhere(userId, goal),
        {
          id: questionId
        }
      ]
    },
    include: practiceQuestionInclude
  });
}

export async function getMaterialPracticeScope(userId: string, materialId: string | null | undefined, db: PracticeDatabase = prisma): Promise<MaterialPracticeScope | null> {
  const id = materialId?.trim();

  if (!id) {
    return null;
  }

  const material = await db.material.findFirst({
    where: {
      id,
      ownerId: userId
    },
    select: {
      id: true,
      title: true,
      candidates: {
        where: {
          status: "confirmed",
          confirmedQuestionId: {
            not: null
          }
        },
        select: {
          confirmedQuestionId: true
        },
        orderBy: [{ updatedAt: "asc" }]
      }
    }
  });

  if (!material) {
    return null;
  }

  return {
    material: {
      id: material.id,
      title: material.title
    },
    questionIds: [...new Set(compactIds(material.candidates.map((candidate) => candidate.confirmedQuestionId)))]
  };
}

export async function questionBelongsToMaterialPracticeScope(
  userId: string,
  materialId: string | null | undefined,
  questionId: string | null | undefined,
  db: PracticeDatabase = prisma
) {
  const normalizedMaterialId = materialId?.trim();
  const normalizedQuestionId = questionId?.trim();

  if (!normalizedMaterialId || !normalizedQuestionId) {
    return false;
  }

  const candidate = await db.materialQuestionCandidate.findFirst({
    where: {
      materialId: normalizedMaterialId,
      status: "confirmed",
      confirmedQuestionId: normalizedQuestionId,
      material: {
        ownerId: userId
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(candidate);
}

async function selectPracticeQuestion(
  userId: string,
  goal: NonNullable<PrimaryGoal>,
  excludeQuestionId?: string | null,
  materialQuestionIds?: string[],
  knowledgeNodeId?: string | null
) {
  const baseWhere = buildFocusedPracticeQuestionWhere(
    materialQuestionIds ? buildMaterialPracticeQuestionWhere(userId, goal, materialQuestionIds) : buildPracticeQuestionWhere(userId, goal),
    knowledgeNodeId
  );
  const attemptedIds = await listAttemptedQuestionIds(userId, goal, baseWhere);
  const recentIds = await listRecentQuestionIds(userId, goal, baseWhere);
  const excludedCurrent = compactIds([excludeQuestionId]);

  return (
    (await findPracticeQuestion(baseWhere, [...attemptedIds, ...excludedCurrent])) ??
    (await findPracticeQuestion(baseWhere, [...recentIds, ...excludedCurrent])) ??
    (await findPracticeQuestion(baseWhere, excludedCurrent)) ??
    (await findPracticeQuestion(baseWhere, []))
  );
}

async function listAttemptedQuestionIds(userId: string, goal: NonNullable<PrimaryGoal>, questionWhere = buildPracticeQuestionWhere(userId, goal)) {
  const answers = await prisma.attemptAnswer.findMany({
    where: {
      attempt: {
        userId,
        goalId: goal.id
      },
      question: questionWhere
    },
    distinct: ["questionId"],
    select: {
      questionId: true
    }
  });

  return answers.map((answer) => answer.questionId);
}

async function listRecentQuestionIds(userId: string, goal: NonNullable<PrimaryGoal>, questionWhere = buildPracticeQuestionWhere(userId, goal)) {
  const answers = await prisma.attemptAnswer.findMany({
    where: {
      attempt: {
        userId,
        goalId: goal.id
      },
      question: questionWhere
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10,
    select: {
      questionId: true
    }
  });

  return [...new Set(answers.map((answer) => answer.questionId))];
}

async function findPracticeQuestion(baseWhere: Prisma.QuestionWhereInput, excludedIds: string[]) {
  const excluded = [...new Set(excludedIds)].filter(Boolean);

  return prisma.question.findFirst({
    where:
      excluded.length > 0
        ? {
            AND: [
              baseWhere,
              {
                id: {
                  notIn: excluded
                }
              }
            ]
          }
        : baseWhere,
    include: practiceQuestionInclude,
    orderBy: [{ updatedAt: "asc" }]
  });
}

function compactIds(ids: Array<string | null | undefined>) {
  return ids.map((id) => id?.trim()).filter((id): id is string => Boolean(id));
}

function parseTags(value: string | null | undefined) {
  return [
    ...new Set(
      String(value ?? "")
        .split(/[,\n，、]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12)
    )
  ];
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim();

  return text || null;
}

function parsePositiveInteger(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toPracticeQuestion(question: PracticeQuestionRecord): PracticeQuestion | null {
  const version = question.versions.find((item) => item.version === question.currentVersion) ?? question.versions[0] ?? null;
  const options = readSingleChoiceOptions(version?.payload ?? question.payload);

  if (!options) {
    return null;
  }

  return {
    id: question.id,
    stem: version?.stem ?? question.stem,
    options,
    difficulty: question.difficulty,
    knowledgeNodes: question.knowledgeBindings.map((binding) => binding.knowledgeNode.title),
    sourceType: question.sourceType
  };
}

export function buildPracticeQuestionWhere(userId: string, goal: NonNullable<PrimaryGoal>): Prisma.QuestionWhereInput {
  return {
    kind: "single_choice",
    reviewStatus: "approved",
    deletedAt: null,
    AND: [
      {
        OR: [
          {
            visibility: "public"
          },
          {
            ownerId: userId,
            visibility: "private"
          }
        ]
      },
      {
        OR: buildGoalScopeWhere(goal)
      }
    ]
  };
}

export function buildMaterialPracticeQuestionWhere(userId: string, goal: NonNullable<PrimaryGoal>, questionIds: string[]): Prisma.QuestionWhereInput {
  return {
    AND: [
      buildPracticeQuestionWhere(userId, goal),
      {
        id: {
          in: [...new Set(compactIds(questionIds))]
        }
      }
    ]
  };
}

function buildFocusedPracticeQuestionWhere(baseWhere: Prisma.QuestionWhereInput, knowledgeNodeId: string | null | undefined): Prisma.QuestionWhereInput {
  const normalized = knowledgeNodeId?.trim();

  if (!normalized) {
    return baseWhere;
  }

  return {
    AND: [
      baseWhere,
      {
        knowledgeBindings: {
          some: {
            knowledgeNodeId: normalized
          }
        }
      }
    ]
  };
}

function buildGoalScopeWhere(goal: NonNullable<PrimaryGoal>): Prisma.QuestionWhereInput[] {
  if (goal.subjectId) {
    return [
      {
        knowledgeBindings: {
          some: {
            knowledgeNode: {
              syllabus: {
                subjectId: goal.subjectId
              }
            }
          }
        }
      },
      {
        paperLinks: {
          some: {
            paper: {
              subjectId: goal.subjectId
            }
          }
        }
      }
    ];
  }

  if (goal.cycleId) {
    return [
      {
        knowledgeBindings: {
          some: {
            knowledgeNode: {
              syllabus: {
                subject: {
                  cycleId: goal.cycleId
                }
              }
            }
          }
        }
      },
      {
        paperLinks: {
          some: {
            paper: {
              cycleId: goal.cycleId
            }
          }
        }
      }
    ];
  }

  if (goal.trackId) {
    return [
      {
        knowledgeBindings: {
          some: {
            knowledgeNode: {
              syllabus: {
                subject: {
                  cycle: {
                    trackId: goal.trackId
                  }
                }
              }
            }
          }
        }
      },
      {
        paperLinks: {
          some: {
            paper: {
              cycle: {
                trackId: goal.trackId
              }
            }
          }
        }
      }
    ];
  }

  return [
    {
      knowledgeBindings: {
        some: {
          knowledgeNode: {
            syllabus: {
              subject: {
                cycle: {
                  track: {
                    programId: goal.programId
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      paperLinks: {
        some: {
          paper: {
            cycle: {
              track: {
                programId: goal.programId
              }
            }
          }
        }
      }
    }
  ];
}

function readSubmittedAnswer(value: Prisma.JsonValue | null | undefined) {
  if (isJsonObject(value) && typeof value.value === "string") {
    return value.value;
  }

  return "";
}

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
