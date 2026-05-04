import { describe, expect, it } from "vitest";
import { gradeObjectiveAnswer } from "@openexam/core/grading";

describe("gradeObjectiveAnswer", () => {
  it("grades single-choice answers case-insensitively", () => {
    expect(gradeObjectiveAnswer("single_choice", "C", " c ", 2)).toEqual({
      isCorrect: true,
      score: 2,
      maxScore: 2
    });
  });

  it("grades multiple-choice answers independent of order", () => {
    expect(gradeObjectiveAnswer("multiple_choice", ["A", "D"], ["d", "a"], 3)).toEqual({
      isCorrect: true,
      score: 3,
      maxScore: 3
    });
  });

  it("does not award partial credit for objective multiple-choice answers", () => {
    expect(gradeObjectiveAnswer("multiple_choice", ["A", "D"], ["A"], 3)).toEqual({
      isCorrect: false,
      score: 0,
      maxScore: 3
    });
  });

  it("grades true/false answers by normalized scalar value", () => {
    expect(gradeObjectiveAnswer("true_false", true, "true")).toEqual({
      isCorrect: true,
      score: 1,
      maxScore: 1
    });
  });
});
