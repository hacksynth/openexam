import { Prisma, QuestionKind } from "@prisma/client";
import { getPrimaryExamGoal, type PrimaryGoal } from "./exam-core";
import { gradeObjectiveAnswer, type ObjectiveQuestionKind } from "./grading";
import { type AiTextGenerator } from "./ai";
import {
  formatAnswerValue,
  readCaseMaterial,
  readRichContentBlocks,
  readSingleChoiceOptions,
  syncWrongNoteForObjectiveAnswer,
  type SingleChoiceOption
} from "./practice";
import type { RichContentBlock } from "./rich-content";
import { generateSubjectiveScoreSuggestion } from "./subjective-scoring";
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
  kind: QuestionKind;
  order: number;
  number: string;
  section: string | null;
  score: number;
  stem: string;
  stemBlocks?: RichContentBlock[] | null;
  options: SingleChoiceOption[];
  knowledgeNodes: string[];
  caseMaterial?: string | null;
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

export type PaperAttemptSessionState =
  | Exclude<PaperAttemptState, { status: "ready" }>
  | {
      status: "ready";
      goal: NonNullable<PrimaryGoal>;
      attempt: {
        id: string;
        status: string;
        startedAt: Date;
        pausedAt: Date | null;
        elapsedSeconds: number;
        answers: Record<string, string>;
      };
      paper: Extract<PaperAttemptState, { status: "ready" }>["paper"];
    };

export type PaperSubmissionQuestion = {
  questionId: string;
  questionVersionId: string | null;
  kind?: QuestionKind | string;
  answerKey: Prisma.JsonValue | null | undefined;
  rubric?: Prisma.JsonValue | null | undefined;
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

export async function getPaperAttemptSession(userId: string, paperId: string): Promise<PaperAttemptSessionState> {
  const state = await getPaperForAttempt(userId, paperId);

  if (state.status !== "ready") {
    return state;
  }

  const attempt = await prisma.$transaction(async (tx) => {
    const existing = await tx.attempt.findFirst({
      where: {
        userId,
        paperId: state.paper.id,
        status: {
          in: ["in_progress", "paused"]
        }
      },
      include: {
        answers: true,
        pauses: true
      },
      orderBy: [{ updatedAt: "desc" }]
    });

    if (existing) {
      return existing;
    }

    return tx.attempt.create({
      data: {
        userId,
        goalId: state.goal.id,
        paperId: state.paper.id,
        status: "in_progress",
        maxScore: state.paper.totalScore
      },
      include: {
        answers: true,
        pauses: true
      }
    });
  });

  return {
    status: "ready",
    goal: state.goal,
    paper: state.paper,
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      pausedAt: attempt.pausedAt,
      elapsedSeconds: calculateAttemptElapsedSeconds({
        startedAt: attempt.startedAt,
        pauses: attempt.pauses,
        now: new Date()
      }),
      answers: Object.fromEntries(attempt.answers.map((answer) => [answer.questionId, readSubmittedAnswer(answer.userAnswer)]))
    }
  };
}

export function calculateAttemptElapsedSeconds(input: {
  startedAt: Date;
  submittedAt?: Date | null;
  pauses: { pausedAt: Date; resumedAt: Date | null }[];
  now?: Date;
}) {
  const end = input.submittedAt ?? input.now ?? new Date();
  const elapsedMs = end.getTime() - input.startedAt.getTime();
  const pausedMs = input.pauses.reduce((sum, pause) => {
    const pauseEnd = pause.resumedAt ?? end;

    return sum + Math.max(0, pauseEnd.getTime() - pause.pausedAt.getTime());
  }, 0);

  return Math.max(0, Math.floor((elapsedMs - pausedMs) / 1000));
}

export async function submitPaperAttempt(
  userId: string,
  input: {
    paperId: string;
    attemptId?: string | null;
    answers: Record<string, string>;
  },
  options: {
    generateText?: AiTextGenerator;
    env?: NodeJS.ProcessEnv;
    db?: typeof prisma;
  } = {}
): Promise<ActionResult<{ attemptId: string; totalScore: number; maxScore: number }>> {
  const db = options.db ?? prisma;
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { ok: false, error: "请先设置考试目标。" };
  }

  const paper = await db.paper.findFirst({
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
        kind: paperQuestion.question.kind,
        answerKey: currentVersion?.answerKey ?? paperQuestion.question.answerKey,
        rubric: currentVersion?.rubric ?? paperQuestion.question.rubric,
        score: paperQuestion.score
      };
    }),
    input.answers
  );

  if (!grading.ok) {
    return { ok: false, error: grading.error };
  }

  const maxScore = grading.data.maxScore;
  const subjectiveSuggestions = await Promise.all(
    grading.data.answers.map(async (answer) => {
      if (answer.isCorrect !== null) {
        return null;
      }

      const paperQuestion = paper.questions.find((item) => item.questionId === answer.questionId);

      if (!paperQuestion || !readSubmittedAnswer(answer.userAnswer)) {
        return null;
      }

      return {
        questionId: answer.questionId,
        score: await generateSubjectiveScoreSuggestion(
          userId,
          {
            questionId: answer.questionId,
            stem: paperQuestion.question.versions[0]?.stem ?? paperQuestion.question.stem,
            answer: readSubmittedAnswer(answer.userAnswer),
            maxScore: answer.maxScore,
            rubric: paperQuestion.question.versions[0]?.rubric ?? paperQuestion.question.rubric
          },
          {
            db,
            env: options.env,
            generateText: options.generateText
          }
        )
      };
    })
  );
  const suggestionByQuestionId = new Map(subjectiveSuggestions.filter((item): item is { questionId: string; score: number } => typeof item?.score === "number").map((item) => [item.questionId, item.score]));
  const answersWithSuggestions = grading.data.answers.map((answer) => {
    const suggestedScore = suggestionByQuestionId.get(answer.questionId) ?? null;

    return {
      ...answer,
      score: answer.isCorrect === null && suggestedScore !== null ? suggestedScore : answer.score,
      aiSuggestedScore: suggestedScore
    };
  });
  const totalScore = answersWithSuggestions.reduce((sum, answer) => sum + (answer.score ?? 0), 0);

  const attemptId = await db.$transaction(async (tx) => {
    const existingAttempt = input.attemptId
      ? await tx.attempt.findFirst({
          where: {
            id: input.attemptId,
            userId,
            paperId: paper.id,
            status: {
              in: ["in_progress", "paused"]
            }
          },
          select: {
            id: true
          }
        })
      : null;

    const attempt = existingAttempt
      ? await tx.attempt.update({
          where: { id: existingAttempt.id },
          data: {
            status: "submitted",
            submittedAt: now,
            pausedAt: null,
            totalScore,
            maxScore
          }
        })
      : await tx.attempt.create({
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

    await tx.attemptPause.updateMany({
      where: {
        attemptId: attempt.id,
        resumedAt: null
      },
      data: {
        resumedAt: now
      }
    });

    for (const answer of answersWithSuggestions) {
      const existingAnswer = await tx.attemptAnswer.findFirst({
        where: {
          attemptId: attempt.id,
          questionId: answer.questionId
        },
        select: {
          id: true
        }
      });
      const data = answer;
      const attemptAnswer = existingAnswer
        ? await tx.attemptAnswer.update({
            where: { id: existingAnswer.id },
            data
          })
        : await tx.attemptAnswer.create({
            data: {
              attemptId: attempt.id,
              ...data
            }
          });

      if (answer.isCorrect !== null) {
        await syncWrongNoteForObjectiveAnswer(tx, {
          userId,
          questionId: answer.questionId,
          attemptAnswerId: attemptAnswer.id,
          isCorrect: answer.isCorrect,
          masteredOnCorrect: true,
          reviewedAt: now
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

export function gradePaperSubmission(questions: PaperSubmissionQuestion[], answers: Record<string, string>) {
  const gradedAnswers: {
    questionId: string;
    questionVersionId: string | null;
    userAnswer: Prisma.InputJsonObject;
    isCorrect: boolean | null;
    score: number | null;
    maxScore: number;
  }[] = [];

  for (const question of questions) {
    const kind = parseQuestionKind(question.kind);
    const answer = (answers[question.questionId] ?? "").trim();

    if (isSubjectiveKind(kind)) {
      gradedAnswers.push({
        questionId: question.questionId,
        questionVersionId: question.questionVersionId,
        userAnswer: { value: answer },
        isCorrect: null,
        score: null,
        maxScore: question.score
      });

      continue;
    }

    const answerKey = readObjectiveAnswerKey(question.answerKey);

    if (answerKey === null) {
      return { ok: false, error: "试卷包含答案配置不完整的题目。" } as const;
    }

    const objectiveKind = kind as ObjectiveQuestionKind;
    const grading = answer
      ? gradeObjectiveAnswer(objectiveKind, answerKey, normalizeObjectiveResponse(objectiveKind, answer), question.score)
      : {
          isCorrect: false,
          score: 0,
          maxScore: question.score
        };

    gradedAnswers.push({
      questionId: question.questionId,
      questionVersionId: question.questionVersionId,
      userAnswer: { value: answer },
      isCorrect: grading.isCorrect,
      score: grading.score,
      maxScore: grading.maxScore
    });
  }

  return {
    ok: true,
    data: {
      answers: gradedAnswers,
      totalScore: gradedAnswers.reduce((sum, answer) => sum + (answer.score ?? 0), 0),
      maxScore: gradedAnswers.reduce((sum, answer) => sum + answer.maxScore, 0)
    }
  } as const;
}

export async function savePaperAttemptAnswer(
  userId: string,
  input: {
    attemptId: string;
    questionId: string;
    answer: string;
  }
): Promise<ActionResult> {
  const attempt = await prisma.attempt.findFirst({
    where: {
      id: input.attemptId.trim(),
      userId,
      status: "in_progress",
      paper: {
        questions: {
          some: {
            questionId: input.questionId.trim()
          }
        }
      }
    },
    include: {
      paper: {
        include: paperInclude
      }
    }
  });

  if (!attempt?.paper) {
    return { ok: false, error: "作答记录不存在或已暂停/提交。" };
  }

  const paperQuestion = attempt.paper.questions.find((question) => question.questionId === input.questionId.trim());

  if (!paperQuestion) {
    return { ok: false, error: "题目不属于当前试卷。" };
  }

  const currentVersion = paperQuestion.question.versions.find((version) => version.version === paperQuestion.question.currentVersion) ?? paperQuestion.question.versions[0] ?? null;
  const existing = await prisma.attemptAnswer.findFirst({
    where: {
      attemptId: attempt.id,
      questionId: paperQuestion.questionId
    },
    select: {
      id: true
    }
  });
  const data = {
    questionId: paperQuestion.questionId,
    questionVersionId: currentVersion?.id ?? null,
    userAnswer: { value: input.answer.trim() },
    maxScore: paperQuestion.score
  };

  if (existing) {
    await prisma.attemptAnswer.update({
      where: { id: existing.id },
      data
    });
  } else {
    await prisma.attemptAnswer.create({
      data: {
        attemptId: attempt.id,
        ...data
      }
    });
  }

  return { ok: true };
}

export async function pausePaperAttempt(userId: string, attemptId: string): Promise<ActionResult> {
  const attempt = await prisma.attempt.findFirst({
    where: {
      id: attemptId.trim(),
      userId,
      status: "in_progress"
    },
    select: {
      id: true
    }
  });

  if (!attempt) {
    return { ok: false, error: "只能暂停进行中的试卷。" };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        status: "paused",
        pausedAt: now
      }
    }),
    prisma.attemptPause.create({
      data: {
        attemptId: attempt.id,
        pausedAt: now
      }
    })
  ]);

  return { ok: true };
}

export async function resumePaperAttempt(userId: string, attemptId: string): Promise<ActionResult> {
  const attempt = await prisma.attempt.findFirst({
    where: {
      id: attemptId.trim(),
      userId,
      status: "paused"
    },
    select: {
      id: true
    }
  });

  if (!attempt) {
    return { ok: false, error: "只能恢复已暂停的试卷。" };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        status: "in_progress",
        pausedAt: null
      }
    }),
    prisma.attemptPause.updateMany({
      where: {
        attemptId: attempt.id,
        resumedAt: null
      },
      data: {
        resumedAt: now
      }
    })
  ]);

  return { ok: true };
}

export async function confirmAttemptAnswerScore(
  userId: string,
  input: {
    attemptAnswerId: string;
    score: string | number;
  }
): Promise<ActionResult> {
  const score = parseScore(input.score);

  if (!score.ok) {
    return score;
  }

  const answer = await prisma.attemptAnswer.findFirst({
    where: {
      id: input.attemptAnswerId.trim(),
      attempt: {
        userId
      }
    },
    include: {
      attempt: true
    }
  });

  if (!answer) {
    return { ok: false, error: "作答记录不存在。" };
  }

  const maxScore = answer.maxScore ?? 0;

  if (score.value > maxScore) {
    return { ok: false, error: "确认分不能超过题目满分。" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.attemptAnswer.update({
      where: { id: answer.id },
      data: {
        score: score.value,
        isCorrect: score.value >= maxScore && maxScore > 0,
        userConfirmed: true
      }
    });

    const answers = await tx.attemptAnswer.findMany({
      where: {
        attemptId: answer.attemptId
      },
      select: {
        score: true,
        maxScore: true,
        questionId: true,
        id: true,
        isCorrect: true
      }
    });
    const totalScore = answers.reduce((sum, item) => sum + (item.score ?? 0), 0);
    const totalMaxScore = answers.reduce((sum, item) => sum + (item.maxScore ?? 0), 0);

    await tx.attempt.update({
      where: { id: answer.attemptId },
      data: {
        status: "graded",
        totalScore,
        maxScore: totalMaxScore
      }
    });

    await syncWrongNoteForObjectiveAnswer(tx, {
      userId,
      questionId: answer.questionId,
      attemptAnswerId: answer.id,
      isCorrect: score.value >= maxScore && maxScore > 0,
      masteredOnCorrect: true,
      reviewedAt: new Date()
    });
  });

  return { ok: true };
}

export async function confirmAllAttemptAnswerScores(userId: string, attemptId: string): Promise<ActionResult> {
  const answers = await prisma.attemptAnswer.findMany({
    where: {
      attemptId,
      attempt: { userId },
      userConfirmed: false,
      aiSuggestedScore: { not: null }
    },
    include: { attempt: true }
  });

  if (answers.length === 0) {
    return { ok: false, error: "没有待确认的主观题。" };
  }

  await prisma.$transaction(async (tx) => {
    for (const answer of answers) {
      const maxScore = answer.maxScore ?? 0;
      const score = answer.aiSuggestedScore ?? 0;

      await tx.attemptAnswer.update({
        where: { id: answer.id },
        data: {
          score,
          isCorrect: score >= maxScore && maxScore > 0,
          userConfirmed: true
        }
      });

      await syncWrongNoteForObjectiveAnswer(tx, {
        userId,
        questionId: answer.questionId,
        attemptAnswerId: answer.id,
        isCorrect: score >= maxScore && maxScore > 0,
        masteredOnCorrect: true,
        reviewedAt: new Date()
      });
    }

    const allAnswers = await tx.attemptAnswer.findMany({
      where: { attemptId },
      select: { score: true, maxScore: true }
    });
    const totalScore = allAnswers.reduce((sum, item) => sum + (item.score ?? 0), 0);
    const totalMaxScore = allAnswers.reduce((sum, item) => sum + (item.maxScore ?? 0), 0);

    const remaining = await tx.attemptAnswer.findFirst({
      where: { attemptId, userConfirmed: false, aiSuggestedScore: { not: null } }
    });

    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status: remaining ? "submitted" : "graded",
        totalScore,
        maxScore: totalMaxScore
      }
    });
  });

  return { ok: true };
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
      kind: answer.question.kind,
      isCorrect: answer.isCorrect,
      score: answer.score ?? 0,
      maxScore: answer.maxScore ?? 0,
      aiSuggestedScore: answer.aiSuggestedScore,
      aiExplanation: answer.aiExplanation,
      userConfirmed: answer.userConfirmed,
      userAnswer: readSubmittedAnswer(answer.userAnswer),
      correctAnswer: formatAnswerValue(readObjectiveAnswerKey(answerKey)),
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
      isCorrect: answer.isCorrect === true,
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
  const payload = currentVersion?.payload ?? question.payload;
  const stem = currentVersion?.stem ?? question.stem;
  const options = readSingleChoiceOptions(payload);

  if (isChoiceKind(question.kind) && !options) {
    return null;
  }

  return {
    id: question.id,
    kind: question.kind,
    order: paperQuestion.order,
    number: paperQuestion.number,
    section: paperQuestion.section,
    score: paperQuestion.score,
    stem,
    stemBlocks: readRichContentBlocks(payload, "stemBlocks", stem),
    options: options ?? [],
    knowledgeNodes: question.knowledgeBindings.map((binding) => binding.knowledgeNode.title),
    caseMaterial: readCaseMaterial(payload)
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

function parseQuestionKind(value: string | null | undefined): QuestionKind {
  return Object.values(QuestionKind).includes(value as QuestionKind) ? (value as QuestionKind) : QuestionKind.single_choice;
}

function isChoiceKind(kind: QuestionKind) {
  return kind === QuestionKind.single_choice || kind === QuestionKind.multiple_choice;
}

function isSubjectiveKind(kind: QuestionKind) {
  return kind === QuestionKind.short_answer || kind === QuestionKind.case_analysis;
}

function readObjectiveAnswerKey(value: Prisma.JsonValue | null | undefined): string | boolean | Array<string | boolean> | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "number" ? String(value) : value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (Array.isArray(value.values)) {
    return value.values.map((item) => (typeof item === "boolean" ? item : String(item)));
  }

  if ("value" in value && (typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean")) {
    return typeof value.value === "number" ? String(value.value) : value.value;
  }

  return null;
}

function normalizeObjectiveResponse(kind: ObjectiveQuestionKind, answer: string) {
  if (kind === "multiple_choice") {
    return answer
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (kind === "true_false") {
    const normalized = answer.trim().toLowerCase();

    if (["true", "t", "yes", "y", "1", "对", "正确"].includes(normalized)) {
      return true;
    }

    if (["false", "f", "no", "n", "0", "错", "错误"].includes(normalized)) {
      return false;
    }
  }

  return answer;
}

function parseScore(value: string | number) {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score) || score < 0) {
    return { ok: false, error: "确认分必须是非负数字。" } as const;
  }

  return { ok: true, value: score } as const;
}

function readSubmittedAnswer(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (typeof record.value === "string") {
      return record.value;
    }
  }

  return "";
}
