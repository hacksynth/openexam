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

export type PracticeQuestionState =
  | { status: "no_goal" }
  | { status: "empty"; goal: NonNullable<PrimaryGoal> }
  | { status: "ready"; goal: NonNullable<PrimaryGoal>; question: PracticeQuestion };

export type PracticeSubmitResult =
  | { ok: true; attemptId: string; isCorrect: boolean }
  | { ok: false; error: string };

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

export async function getPracticeQuestion(userId: string): Promise<PracticeQuestionState> {
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { status: "no_goal" };
  }

  const question = await prisma.question.findFirst({
    where: buildPracticeQuestionWhere(goal),
    include: practiceQuestionInclude,
    orderBy: [{ updatedAt: "asc" }]
  });

  if (!question) {
    return { status: "empty", goal };
  }

  const normalized = toPracticeQuestion(question);

  if (!normalized) {
    return { status: "empty", goal };
  }

  return { status: "ready", goal, question: normalized };
}

export async function submitSingleChoiceAnswer(userId: string, input: { questionId: string; answer: string }): Promise<PracticeSubmitResult> {
  const answer = input.answer.trim();

  if (!answer) {
    return { ok: false, error: "请选择一个答案。" };
  }

  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { ok: false, error: "请先设置考试目标。" };
  }

  const question = await prisma.question.findFirst({
    where: {
      id: input.questionId,
      ...buildPracticeQuestionWhere(goal)
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

    if (!grading.result.isCorrect) {
      await tx.wrongNote.upsert({
        where: {
          userId_questionId: {
            userId,
            questionId: question.id
          }
        },
        update: {
          attemptAnswerId: attemptAnswer.id,
          errorCount: { increment: 1 },
          mastered: false,
          lastReviewedAt: null
        },
        create: {
          userId,
          questionId: question.id,
          attemptAnswerId: attemptAnswer.id
        }
      });
    }

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

export async function listWrongNotes(userId: string) {
  const notes = await prisma.wrongNote.findMany({
    where: { userId },
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
    mastered: note.mastered,
    errorCount: note.errorCount,
    updatedAt: note.updatedAt,
    stem: note.question.versions[0]?.stem ?? note.question.stem,
    explanation: note.question.versions[0]?.explanation ?? note.question.explanation,
    correctAnswer: readSingleChoiceAnswerKey(note.question.versions[0]?.answerKey ?? note.question.answerKey),
    knowledgeNodes: note.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
  }));
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

function buildPracticeQuestionWhere(goal: NonNullable<PrimaryGoal>): Prisma.QuestionWhereInput {
  return {
    kind: "single_choice",
    visibility: "public",
    reviewStatus: "approved",
    deletedAt: null,
    OR: buildGoalScopeWhere(goal)
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
