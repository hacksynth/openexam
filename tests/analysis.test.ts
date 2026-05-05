import { describe, expect, it } from "vitest";
import { summarizeLearningAnalysis } from "@openexam/core/analysis";

describe("learning analysis", () => {
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
      masteredWrongNotes: 1
    });
    expect(summary.weakKnowledgeNodes[0]).toMatchObject({
      id: "node_db",
      title: "事务基础",
      total: 2,
      correct: 1,
      wrong: 1,
      accuracy: 50,
      pendingWrongNotes: 1
    });
  });
});
