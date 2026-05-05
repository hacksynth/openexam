import { Prisma } from "@prisma/client";
import { formatGoalPath, type PrimaryGoal } from "./exam-core";
import { buildPracticeQuestionWhere } from "./practice";
import { prisma } from "./prisma";

type AnalysisDatabase = typeof prisma;

export type AnalysisAnswerInput = {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  userAnswer: string;
  knowledgeNodes: { id: string; title: string }[];
};

export type AnalysisWrongNoteInput = {
  mastered: boolean;
  knowledgeNodes: { id: string; title: string }[];
};

export type KnowledgePerformance = {
  id: string;
  title: string;
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
  maxScore: number;
  accuracy: number;
  scoreRate: number;
  pendingWrongNotes: number;
};

export type LearningAnalysisSummary = {
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  totalScore: number;
  maxScore: number;
  accuracy: number;
  scoreRate: number;
  pendingWrongNotes: number;
  masteredWrongNotes: number;
  weakKnowledgeNodes: KnowledgePerformance[];
};

export type LearningAnalysisState =
  | { status: "no_goal" }
  | {
      status: "ready";
      goal: NonNullable<PrimaryGoal>;
      goalPath: string;
      summary: LearningAnalysisSummary;
      recentAttempts: {
        id: string;
        title: string;
        kind: "practice" | "paper";
        submittedAt: Date | null;
        totalScore: number;
        maxScore: number;
      }[];
    };

export async function getLearningAnalysis(userId: string, db: AnalysisDatabase = prisma): Promise<LearningAnalysisState> {
  const goal = await db.examGoal.findFirst({
    where: { userId, isPrimary: true },
    include: {
      program: true,
      track: true,
      cycle: true,
      subject: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  if (!goal) {
    return { status: "no_goal" };
  }

  const [attempts, wrongNotes] = await Promise.all([
    db.attempt.findMany({
      where: {
        userId,
        goalId: goal.id
      },
      include: {
        paper: true,
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
            }
          }
        }
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: 50
    }),
    db.wrongNote.findMany({
      where: {
        userId,
        question: buildPracticeQuestionWhere(userId, goal)
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
    })
  ]);

  const answers = attempts.flatMap((attempt) =>
    attempt.answers.map((answer) => ({
      isCorrect: Boolean(answer.isCorrect),
      score: answer.score ?? 0,
      maxScore: answer.maxScore ?? 0,
      userAnswer: readSubmittedAnswer(answer.userAnswer),
      knowledgeNodes: answer.question.knowledgeBindings.map((binding) => ({
        id: binding.knowledgeNodeId,
        title: binding.knowledgeNode.title
      }))
    }))
  );
  const summary = summarizeLearningAnalysis(
    answers,
    wrongNotes.map((note) => ({
      mastered: note.mastered,
      knowledgeNodes: note.question.knowledgeBindings.map((binding) => ({
        id: binding.knowledgeNodeId,
        title: binding.knowledgeNode.title
      }))
    }))
  );

  return {
    status: "ready",
    goal,
    goalPath: formatGoalPath(goal),
    summary,
    recentAttempts: attempts.slice(0, 8).map((attempt) => ({
      id: attempt.id,
      title: attempt.paper?.title ?? "单题练习",
      kind: attempt.paperId ? "paper" : "practice",
      submittedAt: attempt.submittedAt,
      totalScore: attempt.totalScore ?? 0,
      maxScore: attempt.maxScore ?? 0
    }))
  };
}

export function summarizeLearningAnalysis(answers: AnalysisAnswerInput[], wrongNotes: AnalysisWrongNoteInput[]): LearningAnalysisSummary {
  const totalQuestions = answers.length;
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const unansweredCount = answers.filter((answer) => !answer.userAnswer).length;
  const wrongCount = totalQuestions - correctCount;
  const totalScore = answers.reduce((sum, answer) => sum + answer.score, 0);
  const maxScore = answers.reduce((sum, answer) => sum + answer.maxScore, 0);
  const pendingWrongNotes = wrongNotes.filter((note) => !note.mastered).length;
  const masteredWrongNotes = wrongNotes.filter((note) => note.mastered).length;
  const knowledge = new Map<string, KnowledgePerformance>();

  for (const answer of answers) {
    for (const node of answer.knowledgeNodes.length > 0 ? answer.knowledgeNodes : [{ id: "unknown", title: "未绑定知识点" }]) {
      const current = knowledge.get(node.id) ?? emptyKnowledgePerformance(node);

      current.total += 1;
      current.correct += answer.isCorrect ? 1 : 0;
      current.wrong += answer.isCorrect ? 0 : 1;
      current.unanswered += answer.userAnswer ? 0 : 1;
      current.score += answer.score;
      current.maxScore += answer.maxScore;
      knowledge.set(node.id, current);
    }
  }

  for (const note of wrongNotes.filter((item) => !item.mastered)) {
    for (const node of note.knowledgeNodes.length > 0 ? note.knowledgeNodes : [{ id: "unknown", title: "未绑定知识点" }]) {
      const current = knowledge.get(node.id) ?? emptyKnowledgePerformance(node);

      current.pendingWrongNotes += 1;
      knowledge.set(node.id, current);
    }
  }

  const weakKnowledgeNodes = [...knowledge.values()]
    .map((node) => ({
      ...node,
      accuracy: node.total > 0 ? Math.round((node.correct / node.total) * 100) : 0,
      scoreRate: node.maxScore > 0 ? Math.round((node.score / node.maxScore) * 100) : 0
    }))
    .sort((left, right) => right.pendingWrongNotes - left.pendingWrongNotes || left.accuracy - right.accuracy || right.wrong - left.wrong || left.title.localeCompare(right.title, "zh-CN"))
    .slice(0, 8);

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    totalScore,
    maxScore,
    accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
    scoreRate: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
    pendingWrongNotes,
    masteredWrongNotes,
    weakKnowledgeNodes
  };
}

export function toStudyPlanSourceStats(analysis: Extract<LearningAnalysisState, { status: "ready" }>) {
  return {
    goalPath: analysis.goalPath,
    totalQuestions: analysis.summary.totalQuestions,
    accuracy: analysis.summary.accuracy,
    scoreRate: analysis.summary.scoreRate,
    pendingWrongNotes: analysis.summary.pendingWrongNotes,
    weakKnowledgeNodes: analysis.summary.weakKnowledgeNodes.map((node) => ({
      id: node.id,
      title: node.title,
      accuracy: node.accuracy,
      pendingWrongNotes: node.pendingWrongNotes,
      total: node.total
    }))
  };
}

function emptyKnowledgePerformance(node: { id: string; title: string }): KnowledgePerformance {
  return {
    id: node.id,
    title: node.title,
    total: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    score: 0,
    maxScore: 0,
    accuracy: 0,
    scoreRate: 0,
    pendingWrongNotes: 0
  };
}

function readSubmittedAnswer(value: Prisma.JsonValue | null | undefined) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.value === "string") {
    return value.value;
  }

  return "";
}
