import { describe, expect, it } from "vitest";
import { listUserQuestionBank } from "@openexam/core/question-bank";

describe("user question bank", () => {
  it("lists only the current user's private questions and narrows by personal material", async () => {
    const calls: { method: string; args: unknown }[] = [];
    const db = {
      material: {
        findFirst: async (args: unknown) => {
          calls.push({ method: "material.findFirst", args });
          return {
            id: "material_1",
            title: "事务资料",
            candidates: [{ confirmedQuestionId: "question_1" }]
          };
        }
      },
      question: {
        count: async (args: unknown) => {
          calls.push({ method: "question.count", args });
          return 1;
        },
        findMany: async (args: unknown) => {
          calls.push({ method: "question.findMany", args });
          return [questionRecord()];
        }
      },
      materialQuestionCandidate: {
        findMany: async (args: unknown) => {
          calls.push({ method: "candidate.findMany", args });
          return [
            {
              confirmedQuestionId: "question_1",
              material: {
                id: "material_1",
                title: "事务资料"
              }
            }
          ];
        }
      }
    };

    await expect(listUserQuestionBank("user_1", { materialId: " material_1 ", sourceType: "user_uploaded" }, db as never)).resolves.toMatchObject({
      sourceType: "user_uploaded",
      material: {
        id: "material_1",
        title: "事务资料"
      },
      questions: [
        {
          id: "question_1",
          sourceType: "user_uploaded",
          materialTitle: "事务资料",
          knowledgePath: "软考 / 软件设计师 / 2026 上半年 / 基础知识 / 数据库基础"
        }
      ]
    });
    expect(calls[0]).toEqual({
      method: "material.findFirst",
      args: {
        where: {
          id: "material_1",
          ownerId: "user_1",
          libraryScope: "personal"
        },
        include: {
          candidates: {
            where: {
              status: "confirmed",
              confirmedQuestionId: {
                not: null
              }
            },
            select: {
              confirmedQuestionId: true
            }
          }
        }
      }
    });
    expect(calls[1]).toMatchObject({
      method: "question.count",
      args: {
        where: {
          ownerId: "user_1",
          visibility: "private",
          deletedAt: null,
          sourceType: "user_uploaded",
          id: {
            in: ["question_1"]
          }
        }
      }
    });
    expect(calls[2]).toMatchObject({
      method: "question.findMany",
      args: {
        where: {
          ownerId: "user_1",
          visibility: "private",
          deletedAt: null,
          sourceType: "user_uploaded",
          id: {
            in: ["question_1"]
          }
        },
        skip: 0,
        take: 20
      }
    });
  });
});

function questionRecord() {
  const now = new Date("2026-05-05T00:00:00.000Z");

  return {
    id: "question_1",
    ownerId: "user_1",
    kind: "single_choice",
    stem: "事务原子性最准确的含义是什么？",
    payload: {},
    answerKey: { value: "A" },
    rubric: null,
    explanation: "原子性要求事务作为不可分割的工作单元。",
    difficulty: 2,
    sourceType: "user_uploaded",
    sourceTitle: "事务资料 · 第 1 段",
    sourceUrl: null,
    sourceLicense: "自用资料",
    visibility: "private",
    reviewStatus: "approved",
    currentVersion: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    versions: [],
    knowledgeBindings: [
      {
        questionId: "question_1",
        knowledgeNodeId: "node_1",
        weight: 1,
        isPrimary: true,
        knowledgeNode: {
          id: "node_1",
          code: "DB",
          title: "数据库基础",
          description: null,
          examExpectation: null,
          syllabusId: "syllabus_1",
          parentId: null,
          order: 1,
          createdAt: now,
          updatedAt: now,
          syllabus: {
            id: "syllabus_1",
            subjectId: "subject_1",
            title: "大纲",
            version: "2026",
            createdAt: now,
            updatedAt: now,
            subject: {
              id: "subject_1",
              cycleId: "cycle_1",
              name: "基础知识",
              slug: "foundation",
              order: 1,
              createdAt: now,
              updatedAt: now,
              homepageStatus: "hidden",
              homepageOrder: 0,
              homepageDescription: null,
              cycle: {
                id: "cycle_1",
                trackId: "track_1",
                name: "2026 上半年",
                slug: "2026a",
                startsAt: null,
                endsAt: null,
                createdAt: now,
                updatedAt: now,
                track: {
                  id: "track_1",
                  programId: "program_1",
                  name: "软件设计师",
                  slug: "software-designer",
                  level: null,
                  createdAt: now,
                  updatedAt: now,
                  homepageStatus: "open",
                  homepageOrder: 1,
                  homepageDescription: null,
                  program: {
                    id: "program_1",
                    name: "软考",
                    slug: "ruankao",
                    description: null,
                    homepageStatus: "open",
                    homepageOrder: 1,
                    homepageDescription: null,
                    homepageSelectionLevel: "track",
                    createdAt: now,
                    updatedAt: now
                  }
                }
              }
            }
          }
        }
      }
    ]
  };
}
