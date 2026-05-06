import { describe, expect, it } from "vitest";
import type { PrimaryGoal } from "@openexam/core/exam-core";
import {
  buildKnowledgeScopedPracticeQuestionWhere,
  buildMaterialPracticeQuestionWhere,
  buildPracticeQuestionWhere,
  getMaterialPracticeScope,
  gradePracticeObjectiveQuestion,
  gradeSingleChoiceQuestion,
  normalizePracticeMode,
  questionBelongsToMaterialPracticeScope,
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

  it("grades multi-kind objective practice submissions", () => {
    expect(gradePracticeObjectiveQuestion({ kind: "multiple_choice", answerKey: { values: ["A", "D"] }, response: "D,A", maxScore: 3 })).toMatchObject({
      ok: true,
      correctAnswer: "A, D",
      result: {
        isCorrect: true,
        score: 3
      }
    });
    expect(gradePracticeObjectiveQuestion({ kind: "true_false", answerKey: { value: false }, response: "错误" })).toMatchObject({
      ok: true,
      correctAnswer: "错误",
      result: {
        isCorrect: true
      }
    });
    expect(gradePracticeObjectiveQuestion({ kind: "blank", answerKey: { value: "事务" }, response: " 事务 " })).toMatchObject({
      ok: true,
      result: {
        isCorrect: true
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
    expect(buildPracticeQuestionWhere("user_1", goal({ subjectId: "subject_1" }))).not.toHaveProperty("kind");
  });

  it("adds a confirmed material question id filter on top of the normal practice scope", () => {
    expect(buildMaterialPracticeQuestionWhere("user_1", goal({ subjectId: "subject_1" }), ["q_1", "q_2", "q_1"])).toMatchObject({
      AND: [
        {
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
        },
        {
          id: {
            in: ["q_1", "q_2"]
          }
        }
      ]
    });
  });

  it("adds a descendant-aware knowledge node filter on top of the current practice scope", () => {
    expect(buildKnowledgeScopedPracticeQuestionWhere(buildPracticeQuestionWhere("user_1", goal({ subjectId: "subject_1" })), ["node_parent", "node_child", "node_child"])).toMatchObject({
      AND: [
        buildPracticeQuestionWhere("user_1", goal({ subjectId: "subject_1" })),
        {
          knowledgeBindings: {
            some: {
              knowledgeNodeId: {
                in: ["node_parent", "node_child"]
              }
            }
          }
        }
      ]
    });
  });

  it("normalizes supported practice modes and falls back to new practice", () => {
    expect(normalizePracticeMode("wrong")).toBe("wrong");
    expect(normalizePracticeMode("retry_practiced")).toBe("retry_practiced");
    expect(normalizePracticeMode("comprehensive")).toBe("comprehensive");
    expect(normalizePracticeMode("bad")).toBe("new");
  });

  it("loads only confirmed question ids from the current user's material", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      material: {
        findFirst: async (args: unknown) => {
          calls.push({ method: "material.findFirst", args });
          return {
            id: "material_1",
            title: "事务资料",
            candidates: [{ confirmedQuestionId: "q_1" }, { confirmedQuestionId: " q_2 " }, { confirmedQuestionId: "q_1" }]
          };
        }
      }
    };

    await expect(getMaterialPracticeScope("user_1", " material_1 ", db as never)).resolves.toEqual({
      material: {
        id: "material_1",
        title: "事务资料"
      },
      questionIds: ["q_1", "q_2"]
    });
    expect(calls[0]).toEqual({
      method: "material.findFirst",
      args: {
        where: {
          id: "material_1",
          ownerId: "user_1",
          libraryScope: "personal"
        },
        select: {
          id: true,
          title: true,
          candidates: {
            where: {
              status: "confirmed",
              confirmedQuestionId: {
                not: null
              }
            },
            select: {
              confirmedQuestionId: true
            },
            orderBy: [{ updatedAt: "asc" }]
          }
        }
      }
    });
  });

  it("checks material ownership and confirmed candidate linkage before material submissions", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      materialQuestionCandidate: {
        findFirst: async (args: unknown) => {
          calls.push({ method: "materialQuestionCandidate.findFirst", args });
          const where = args && typeof args === "object" && "where" in args ? args.where : null;

          return where && typeof where === "object" && "confirmedQuestionId" in where && where.confirmedQuestionId === "q_1" ? { id: "candidate_1" } : null;
        }
      }
    };

    await expect(questionBelongsToMaterialPracticeScope("user_1", " material_1 ", " q_1 ", db as never)).resolves.toBe(true);
    await expect(questionBelongsToMaterialPracticeScope("user_1", "material_1", "q_other", db as never)).resolves.toBe(false);
    expect(calls[0]).toEqual({
      method: "materialQuestionCandidate.findFirst",
      args: {
        where: {
          materialId: "material_1",
          status: "confirmed",
          confirmedQuestionId: "q_1",
          material: {
            ownerId: "user_1",
            libraryScope: "personal"
          }
        },
        select: {
          id: true
        }
      }
    });
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
