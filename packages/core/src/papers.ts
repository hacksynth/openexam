import { Prisma } from "@prisma/client";
import { getPrimaryExamGoal, type PrimaryGoal } from "./exam-core";
import {
  gradeSingleChoiceQuestion,
  readSingleChoiceAnswerKey,
  readSingleChoiceOptions,
  type SingleChoiceOption
} from "./practice";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

const paperInclude = {
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
      question: {
        include: {
          knowledgeBindings: {
            include: {
              knowledgeNode: true
            }
          },
          versions: {
            orderBy: {
              version: "desc"
            },
            take: 1
          }
        }
      }
    }
  }
} satisfies Prisma.PaperInclude;

type PaperRecord = Prisma.PaperGetPayload<{ include: typeof paperInclude }>;
type PaperQuestionRecord = PaperRecord["questions"][number];

export type PaperQuestionForAttempt = {
  id: string;
  order: number;
  number: string;
  section: string | null;
  score: number;
  stem: string;
  options: SingleChoiceOption[];
  knowledgeNodes: string[];
};

export type PaperAttemptState =
  | { status: "no_goal" }
  | { status: "empty"; goal: NonNullable<PrimaryGoal>; error: string }
  | {
      status: "ready";
      goal: NonNullable<PrimaryGoal>;
      paper: {
        id: string;
        title: string;
        paperType: string;
        subjectPath: string;
        totalScore: number;
        questions: PaperQuestionForAttempt[];
      };
    };

export async function listAvailablePapers(userId: string) {
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { status: "no_goal" } as const;
  }

  const papers = await prisma.paper.findMany({
    where: buildPublicPaperWhere(goal),
    include: paperInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: 50
  });

  return {
    status: papers.length > 0 ? "ready" : "empty",
    goal,
    papers: papers.map(toPaperListItem)
  } as const;
}

export async function getPaperForAttempt(userId: string, paperId: string): Promise<PaperAttemptState> {
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { status: "no_goal" };
  }

  const paper = await prisma.paper.findFirst({
    where: {
      AND: [
        buildPublicPaperWhere(goal),
        {
          id: paperId
        }
      ]
    },
    include: paperInclude
  });

  if (!paper) {
    return { status: "empty", goal, error: "试卷不存在，或不在当前考试目标范围内。" };
  }

  const questions = paper.questions.map(toPaperQuestionForAttempt).filter((question): question is PaperQuestionForAttempt => Boolean(question));

  if (questions.length === 0) {
    return { status: "empty", goal, error: "试卷没有可作答题目。" };
  }

  return {
    status: "ready",
    goal,
    paper: {
      id: paper.id,
      title: paper.title,
      paperType: paper.paperType,
      subjectPath: formatPaperSubjectPath(paper),
      totalScore: paper.questions.reduce((sum, question) => sum + question.score, 0),
      questions
    }
  };
}

export async function submitPaperAttempt(
  userId: string,
  input: {
    paperId: string;
    answers: Record<string, string>;
  }
): Promise<ActionResult<{ attemptId: string; totalScore: number; maxScore: number }>> {
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { ok: false, error: "请先设置考试目标。" };
  }

  const paper = await prisma.paper.findFirst({
    where: {
      AND: [
        buildPublicPaperWhere(goal),
        {
          id: input.paperId
        }
      ]
    },
    include: paperInclude
  });

  if (!paper) {
    return { ok: false, error: "试卷不存在，或不在当前考试目标范围内。" };
  }

  if (paper.questions.length === 0) {
    return { ok: false, error: "试卷没有可作答题目。" };
  }

  const now = new Date();
  const gradedAnswers: {
    questionId: string;
    questionVersionId: string | null;
    userAnswer: Prisma.InputJsonObject;
    isCorrect: boolean;
    score: number;
    maxScore: number;
  }[] = [];

  for (const paperQuestion of paper.questions) {
    const question = paperQuestion.question;
    const currentVersion = question.versions.find((version) => version.version === question.currentVersion) ?? question.versions[0] ?? null;
    const answer = (input.answers[question.id] ?? "").trim().toUpperCase();
    const answerKey = currentVersion?.answerKey ?? question.answerKey;

    if (!readSingleChoiceAnswerKey(answerKey)) {
      return { ok: false, error: "试卷包含答案配置不完整的题目。" };
    }

    const grading = answer
      ? gradeSingleChoiceQuestion({
          answerKey,
          response: answer,
          maxScore: paperQuestion.score
        })
      : {
          ok: true as const,
          result: {
            isCorrect: false,
            score: 0,
            maxScore: paperQuestion.score
          }
        };

    if (!grading.ok) {
      return { ok: false, error: grading.error };
    }

    gradedAnswers.push({
      questionId: question.id,
      questionVersionId: currentVersion?.id ?? null,
      userAnswer: { value: answer },
      isCorrect: grading.result.isCorrect,
      score: grading.result.score,
      maxScore: grading.result.maxScore
    });
  }

  const maxScore = gradedAnswers.reduce((sum, answer) => sum + answer.maxScore, 0);
  const totalScore = gradedAnswers.reduce((sum, answer) => sum + answer.score, 0);
  const attemptId = await prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.create({
      data: {
        userId,
        goalId: goal.id,
        paperId: paper.id,
        status: "submitted",
        submittedAt: now,
        totalScore,
        maxScore
      }
    });

    for (const answer of gradedAnswers) {
      const attemptAnswer = await tx.attemptAnswer.create({
        data: {
          attemptId: attempt.id,
          ...answer
        }
      });

      if (!answer.isCorrect) {
        await tx.wrongNote.upsert({
          where: {
            userId_questionId: {
              userId,
              questionId: answer.questionId
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
            questionId: answer.questionId,
            attemptAnswerId: attemptAnswer.id
          }
        });
      }
    }

    return attempt.id;
  });

  return {
    ok: true,
    data: {
      attemptId,
      totalScore,
      maxScore
    }
  };
}

function toPaperListItem(paper: PaperRecord) {
  return {
    id: paper.id,
    title: paper.title,
    paperType: paper.paperType,
    subjectPath: formatPaperSubjectPath(paper),
    questionCount: paper.questions.length,
    totalScore: paper.questions.reduce((sum, question) => sum + question.score, 0),
    updatedAt: paper.updatedAt
  };
}

function toPaperQuestionForAttempt(paperQuestion: PaperQuestionRecord): PaperQuestionForAttempt | null {
  const question = paperQuestion.question;
  const currentVersion = question.versions.find((version) => version.version === question.currentVersion) ?? question.versions[0] ?? null;
  const options = readSingleChoiceOptions(currentVersion?.payload ?? question.payload);

  if (!options) {
    return null;
  }

  return {
    id: question.id,
    order: paperQuestion.order,
    number: paperQuestion.number,
    section: paperQuestion.section,
    score: paperQuestion.score,
    stem: currentVersion?.stem ?? question.stem,
    options,
    knowledgeNodes: question.knowledgeBindings.map((binding) => binding.knowledgeNode.title)
  };
}

function buildPublicPaperWhere(goal: NonNullable<PrimaryGoal>): Prisma.PaperWhereInput {
  return {
    visibility: "public",
    questions: {
      some: {
        question: {
          deletedAt: null,
          visibility: "public",
          reviewStatus: "approved"
        }
      }
    },
    OR: buildPaperScopeWhere(goal)
  };
}

function buildPaperScopeWhere(goal: NonNullable<PrimaryGoal>): Prisma.PaperWhereInput[] {
  if (goal.subjectId) {
    return [
      { subjectId: goal.subjectId },
      {
        questions: {
          some: {
            question: questionScopeBySubject(goal.subjectId)
          }
        }
      }
    ];
  }

  if (goal.cycleId) {
    return [
      { cycleId: goal.cycleId },
      {
        subject: {
          cycleId: goal.cycleId
        }
      },
      {
        questions: {
          some: {
            question: questionScopeByCycle(goal.cycleId)
          }
        }
      }
    ];
  }

  if (goal.trackId) {
    return [
      {
        cycle: {
          trackId: goal.trackId
        }
      },
      {
        subject: {
          cycle: {
            trackId: goal.trackId
          }
        }
      },
      {
        questions: {
          some: {
            question: questionScopeByTrack(goal.trackId)
          }
        }
      }
    ];
  }

  return [
    {
      cycle: {
        track: {
          programId: goal.programId
        }
      }
    },
    {
      subject: {
        cycle: {
          track: {
            programId: goal.programId
          }
        }
      }
    },
    {
      questions: {
        some: {
          question: questionScopeByProgram(goal.programId)
        }
      }
    }
  ];
}

function questionScopeBySubject(subjectId: string): Prisma.QuestionWhereInput {
  return {
    knowledgeBindings: {
      some: {
        knowledgeNode: {
          syllabus: {
            subjectId
          }
        }
      }
    }
  };
}

function questionScopeByCycle(cycleId: string): Prisma.QuestionWhereInput {
  return {
    knowledgeBindings: {
      some: {
        knowledgeNode: {
          syllabus: {
            subject: {
              cycleId
            }
          }
        }
      }
    }
  };
}

function questionScopeByTrack(trackId: string): Prisma.QuestionWhereInput {
  return {
    knowledgeBindings: {
      some: {
        knowledgeNode: {
          syllabus: {
            subject: {
              cycle: {
                trackId
              }
            }
          }
        }
      }
    }
  };
}

function questionScopeByProgram(programId: string): Prisma.QuestionWhereInput {
  return {
    knowledgeBindings: {
      some: {
        knowledgeNode: {
          syllabus: {
            subject: {
              cycle: {
                track: {
                  programId
                }
              }
            }
          }
        }
      }
    }
  };
}

function formatPaperSubjectPath(paper: PaperRecord) {
  const subject = paper.subject;
  const cycle = subject?.cycle ?? paper.cycle;
  const track = cycle?.track;

  if (subject && cycle && track) {
    return `${track.program.name} / ${track.name} / ${cycle.name} / ${subject.name}`;
  }

  if (paper.cycle) {
    return `${paper.cycle.track.program.name} / ${paper.cycle.track.name} / ${paper.cycle.name}`;
  }

  return "未绑定科目";
}
