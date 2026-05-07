import { describe, expect, it } from "vitest";
import { getLearningAnalysis, summarizeLearningAnalysis } from "@openexam/core/analysis";

describe("learning analysis", () => {
  it("uses all finalized answers for summary while limiting the recent attempt list", async () => {
    const queryArgs: { answerFindMany?: any; recentAttemptFindMany?: any } = {};
    const now = new Date("2026-05-07T08:00:00.000Z");
    const answerRows = Array.from({ length: 75 }, (_, index) => ({
      isCorrect: index < 40,
      score: index < 40 ? 1 : 0,
      maxScore: 1,
      userAnswer: { value: "A" },
      question: {
        kind: "single_choice",
        difficulty: 1,
        knowledgeBindings: [
          {
            knowledgeNodeId: "node_single_choice",
            knowledgeNode: {
              title: "单选基础"
            }
          }
        ]
      }
    }));
    const recentAttempts = Array.from({ length: 8 }, (_, index) => ({
      id: `attempt_${index}`,
      paperId: null,
      paper: null,
      submittedAt: now,
      totalScore: 1,
      maxScore: 1
    }));
    const db = {
      examGoal: {
        findFirst: async () => ({
          id: "goal_1",
          program: { name: "软考" },
          track: null,
          cycle: null,
          subject: null
        })
      },
      attemptAnswer: {
        findMany: async (args: any) => {
          queryArgs.answerFindMany = args;
          return answerRows;
        }
      },
      attempt: {
        findMany: async (args: any) => {
          queryArgs.recentAttemptFindMany = args;
          return recentAttempts;
        }
      },
      wrongNote: {
        findMany: async () => []
      },
      consolidationNote: {
        findMany: async () => []
      }
    };

    const state = await getLearningAnalysis("user_1", db as never);

    expect(state.status).toBe("ready");
    if (state.status !== "ready") {
      return;
    }

    expect(state.summary.totalQuestions).toBe(75);
    expect(state.summary.correctCount).toBe(40);
    expect(state.summary.accuracy).toBe(53);
    expect(state.recentAttempts).toHaveLength(8);
    expect(queryArgs.answerFindMany.take).toBeUndefined();
    expect(queryArgs.answerFindMany.where.attempt.status.in).toEqual(["submitted", "graded"]);
    expect(queryArgs.recentAttemptFindMany.take).toBe(8);
  });

  it("summarizes accuracy, unanswered questions, weak knowledge, and pending wrong notes", () => {
    const summary = summarizeLearningAnalysis(
      [
        {
          isCorrect: true,
          score: 1,
          maxScore: 1,
          userAnswer: "A",
          kind: "single_choice",
          difficulty: 1,
          knowledgeNodes: [{ id: "node_db", title: "事务基础" }]
        },
        {
          isCorrect: false,
          score: 0,
          maxScore: 1,
          userAnswer: "B",
          kind: "single_choice",
          difficulty: 1,
          knowledgeNodes: [{ id: "node_db", title: "事务基础" }]
        },
        {
          isCorrect: false,
          score: 0,
          maxScore: 1,
          userAnswer: "",
          kind: "single_choice",
          difficulty: 2,
          knowledgeNodes: [{ id: "node_uml", title: "UML 建模" }]
        }
      ],
      [
        {
          mastered: false,
          knowledgeNodes: [{ id: "node_db", title: "事务基础" }]
        },
        {
          mastered: true,
          knowledgeNodes: [{ id: "node_uml", title: "UML 建模" }]
        }
      ],
      [
        {
          mastered: false,
          knowledgeNodes: [{ id: "node_uml", title: "UML 建模" }]
        }
      ]
    );

    expect(summary).toMatchObject({
      totalQuestions: 3,
      correctCount: 1,
      wrongCount: 2,
      unansweredCount: 1,
      totalScore: 1,
      maxScore: 3,
      accuracy: 33,
      scoreRate: 33,
      pendingWrongNotes: 1,
      masteredWrongNotes: 1,
      pendingConsolidationNotes: 1,
      masteryRiskCount: 2
    });
    expect(summary.weakKnowledgeNodes[0]).toMatchObject({
      id: "node_db",
      title: "事务基础",
      total: 2,
      correct: 1,
      wrong: 1,
      accuracy: 50,
      pendingWrongNotes: 1,
      pendingConsolidationNotes: 0
    });
  });
});
