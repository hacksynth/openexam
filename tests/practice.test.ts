import { describe, expect, it } from "vitest";
import type { PrimaryGoal } from "@openexam/core/exam-core";
import {
  buildPracticeQuestionWhere,
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

describe("practice question access", () => {
  it("allows public questions and only the current user's private questions within the goal scope", () => {
    expect(buildPracticeQuestionWhere("user_1", goal({ subjectId: "subject_1" }))).toMatchObject({
      kind: "single_choice",
      reviewStatus: "approved",
      deletedAt: null,
      AND: [
        {
          OR: [
            { visibility: "public" },
            { ownerId: "user_1", visibility: "private" }
          ]
        },
        {
          OR: [
            {
              knowledgeBindings: {
                some: {
                  knowledgeNode: {
                    syllabus: {
                      subjectId: "subject_1"
                    }
                  }
                }
              }
            },
            {
              paperLinks: {
                some: {
                  paper: {
                    subjectId: "subject_1"
                  }
                }
              }
            }
          ]
        }
      ]
    });

    expect(JSON.stringify(buildPracticeQuestionWhere("user_1", goal()))).not.toContain("user_2");
  });
});

function goal(overrides: Partial<NonNullable<PrimaryGoal>> = {}): NonNullable<PrimaryGoal> {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "goal_1",
    userId: "user_1",
    programId: "program_1",
    trackId: null,
    cycleId: null,
    subjectId: null,
    targetDate: null,
    targetScore: null,
    dailyMinutes: 60,
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
    program: {
      id: "program_1",
      name: "软考",
      slug: "ruankao",
      description: null,
      createdAt: now,
      updatedAt: now
    },
    track: null,
    cycle: null,
    subject: null,
    ...overrides
  } as NonNullable<PrimaryGoal>;
}
