import { describe, expect, it } from "vitest";
import {
  gradeSingleChoiceQuestion,
  readSingleChoiceAnswerKey,
  readSingleChoiceOptions,
  summarizeWrongNotes
} from "@openexam/core/practice";

describe("single-choice practice helpers", () => {
  it("reads options from question payload", () => {
    expect(
      readSingleChoiceOptions({
        options: [
          { key: "A", text: "O(1)" },
          { key: "B", text: "O(n)" }
        ]
      })
    ).toEqual([
      { key: "A", text: "O(1)" },
      { key: "B", text: "O(n)" }
    ]);
  });

  it("reads answer key from structured answer payload", () => {
    expect(readSingleChoiceAnswerKey({ value: "C" })).toBe("C");
  });

  it("grades correct and incorrect single-choice submissions", () => {
    expect(gradeSingleChoiceQuestion({ answerKey: { value: "C" }, response: " c ", maxScore: 2 })).toEqual({
      ok: true,
      correctAnswer: "C",
      result: {
        isCorrect: true,
        score: 2,
        maxScore: 2
      }
    });

    expect(gradeSingleChoiceQuestion({ answerKey: { value: "C" }, response: "A" })).toEqual({
      ok: true,
      correctAnswer: "C",
      result: {
        isCorrect: false,
        score: 0,
        maxScore: 1
      }
    });
  });
});

describe("summarizeWrongNotes", () => {
  it("counts pending wrong notes and ranks weak knowledge nodes", () => {
    expect(
      summarizeWrongNotes([
        { mastered: false, knowledgeNodes: ["算法复杂度"] },
        { mastered: false, knowledgeNodes: ["算法复杂度", "UML 建模"] },
        { mastered: true, knowledgeNodes: ["数据库规范化"] }
      ])
    ).toEqual({
      pendingWrongNotes: 2,
      weakKnowledgeNodes: [
        { title: "算法复杂度", count: 2 },
        { title: "UML 建模", count: 1 }
      ]
    });
  });
});
