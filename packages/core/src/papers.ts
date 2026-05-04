import { Prisma } from "@prisma/client";
import { getPrimaryExamGoal, type PrimaryGoal } from "./exam-core";
import {
  gradeSingleChoiceQuestion,
  readSingleChoiceAnswerKey,
  readSingleChoiceOptions,
  syncWrongNoteForObjectiveAnswer,
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

export type PaperSubmissionQuestion = {
  questionId: string;
  questionVersionId: string | null;
  answerKey: Prisma.JsonValue | null | undefined;
  score: number;
};

export type AttemptReportAnswerSummaryInput = {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  userAnswer: string;
  knowledgeNodes: string[];
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
  const grading = gradePaperSubmission(
    paper.questions.map((paperQuestion) => {
      const currentVersion = paperQuestion.question.versions.find((version) => version.version === paperQuestion.question.currentVersion) ?? paperQuestion.question.versions[0] ?? null;

      return {
        questionId: paperQuestion.question.id,
        questionVersionId: currentVersion?.id ?? null,
        answerKey: currentVersion?.answerKey ?? paperQuestion.question.answerKey,
        score: paperQuestion.score
      };
    }),
    input.answers
  );

  if (!grading.ok) {
    return { ok: false, error: grading.error };
  }

  const maxScore = grading.data.maxScore;
  const totalScore = grading.data.totalScore;
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

    for (const answer of grading.data.answers) {
      const attemptAnswer = await tx.attemptAnswer.create({
        data: {
          attemptId: attempt.id,
          ...answer
        }
      });

      await syncWrongNoteForObjectiveAnswer(tx, {
        userId,
        questionId: answer.questionId,
        attemptAnswerId: attemptAnswer.id,
        isCorrect: answer.isCorrect,
        reviewedAt: now
      });
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

export function gradePaperSubmission(questions: PaperSubmissionQuestion[], answers: Record<string, string>) {
  const gradedAnswers: {
    questionId: string;
    questionVersionId: string | null;
    userAnswer: Prisma.InputJsonObject;
    isCorrect: boolean;
    score: number;
    maxScore: number;
  }[] = [];

  for (const question of questions) {
    const answer = (answers[question.questionId] ?? "").trim().toUpperCase();

    if (!readSingleChoiceAnswerKey(question.answerKey)) {
      return { ok: false, error: "试卷包含答案配置不完整的题目。" } as const;
    }

    const grading = answer
      ? gradeSingleChoiceQuestion({
          answerKey: question.answerKey,
          response: answer,
          maxScore: question.score
        })
      : {
          ok: true as const,
          result: {
            isCorrect: false,
            score: 0,
            maxScore: question.score
          }
        };

    if (!grading.ok) {
      return { ok: false, error: grading.error } as const;
    }

    gradedAnswers.push({
      questionId: question.questionId,
      questionVersionId: question.questionVersionId,
      userAnswer: { value: answer },
      isCorrect: grading.result.isCorrect,
      score: grading.result.score,
      maxScore: grading.result.maxScore
    });
  }

  return {
    ok: true,
    data: {
      answers: gradedAnswers,
      totalScore: gradedAnswers.reduce((sum, answer) => sum + answer.score, 0),
      maxScore: gradedAnswers.reduce((sum, answer) => sum + answer.maxScore, 0)
    }
  } as const;
}

export async function getAttemptReport(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: {
      id: attemptId,
      userId
    },
    include: {
      paper: true,
      goal: {
        include: {
          program: true,
          track: true,
          cycle: true,
          subject: true
        }
      },
      answers: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          questionVersion: true,
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
      }
    }
  });

  if (!attempt || attempt.answers.length === 0) {
    return null;
  }

  const answers = attempt.answers.map((answer, index) => {
    const answerKey = answer.questionVersion?.answerKey ?? answer.question.answerKey;
    const knowledgeNodes = answer.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title);

    return {
      id: answer.id,
      order: index + 1,
      questionId: answer.questionId,
      isCorrect: Boolean(answer.isCorrect),
      score: answer.score ?? 0,
      maxScore: answer.maxScore ?? 0,
      userAnswer: readSubmittedAnswer(answer.userAnswer),
      correctAnswer: readSingleChoiceAnswerKey(answerKey),
      explanation: answer.questionVersion?.explanation ?? answer.question.explanation,
      question: {
        id: answer.questionId,
        stem: answer.questionVersion?.stem ?? answer.question.stem,
        options: readSingleChoiceOptions(answer.questionVersion?.payload ?? answer.question.payload) ?? [],
        knowledgeNodes
      }
    };
  });
  const summary = summarizeAttemptReportAnswers(
    answers.map((answer) => ({
      isCorrect: answer.isCorrect,
      score: answer.score,
      maxScore: answer.maxScore,
      userAnswer: answer.userAnswer,
      knowledgeNodes: answer.question.knowledgeNodes
    }))
  );

  return {
    id: attempt.id,
    kind: attempt.paperId ? "paper" : "practice",
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    title: attempt.paper?.title ?? "单题练习",
    goalPath: attempt.goal ? [attempt.goal.program.name, attempt.goal.track?.name, attempt.goal.cycle?.name, attempt.goal.subject?.name].filter(Boolean).join(" / ") : "未绑定目标",
    totalScore: attempt.totalScore ?? summary.totalScore,
    maxScore: attempt.maxScore ?? summary.maxScore,
    summary,
    answers
  };
}

export function summarizeAttemptReportAnswers(answers: AttemptReportAnswerSummaryInput[]) {
  const totalQuestions = answers.length;
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const wrongCount = totalQuestions - correctCount;
  const unansweredCount = answers.filter((answer) => !answer.userAnswer).length;
  const totalScore = answers.reduce((sum, answer) => sum + answer.score, 0);
  const maxScore = answers.reduce((sum, answer) => sum + answer.maxScore, 0);
  const knowledge = new Map<string, { title: string; total: number; correct: number; wrong: number; score: number; maxScore: number }>();

  for (const answer of answers) {
    for (const title of answer.knowledgeNodes.length > 0 ? answer.knowledgeNodes : ["未绑定知识点"]) {
      const current = knowledge.get(title) ?? { title, total: 0, correct: 0, wrong: 0, score: 0, maxScore: 0 };

      current.total += 1;
      current.correct += answer.isCorrect ? 1 : 0;
      current.wrong += answer.isCorrect ? 0 : 1;
      current.score += answer.score;
      current.maxScore += answer.maxScore;
      knowledge.set(title, current);
    }
  }

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    totalScore,
    maxScore,
    accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
    scoreRate: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
    knowledgeStats: [...knowledge.values()].sort((left, right) => right.wrong - left.wrong || left.title.localeCompare(right.title, "zh-CN"))
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
    archivedAt: null,
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

function readSubmittedAnswer(value: Prisma.JsonValue | null | undefined) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.value === "string") {
    return value.value;
  }

  return "";
}
