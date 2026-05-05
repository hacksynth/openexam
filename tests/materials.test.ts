import { describe, expect, it } from "vitest";
import { createMaterialQuestionCandidates, validateExtractedQuestionsJson } from "@openexam/core/materials";

describe("material question extraction", () => {
  it("accepts valid single-choice extraction JSON", () => {
    expect(
      validateExtractedQuestionsJson(
        JSON.stringify({
          questions: [
            {
              stem: "事务原子性最准确的含义是什么？",
              options: {
                A: "全部成功或全部失败",
                B: "并发事务互不影响",
                C: "提交后永久保存",
                D: "数据满足约束"
              },
              answer: "A",
              explanation: "原子性要求事务作为不可分割的工作单元。",
              difficulty: 2,
              knowledgeNodeId: "node_1",
              sourceRef: "第 1 段"
            }
          ]
        })
      )
    ).toEqual({
      ok: true,
      data: {
        questions: [
          {
            stem: "事务原子性最准确的含义是什么？",
            options: {
              A: "全部成功或全部失败",
              B: "并发事务互不影响",
              C: "提交后永久保存",
              D: "数据满足约束"
            },
            answer: "A",
            explanation: "原子性要求事务作为不可分割的工作单元。",
            difficulty: 2,
            knowledgeNodeId: "node_1",
            sourceRef: "第 1 段"
          }
        ]
      }
    });
  });

  it("rejects invalid extraction JSON", () => {
    expect(validateExtractedQuestionsJson("{not json")).toEqual({
      ok: false,
      error: "AI 抽题结果不是有效 JSON。"
    });
    expect(validateExtractedQuestionsJson(JSON.stringify({ questions: [] }))).toEqual({
      ok: false,
      error: "AI 抽题结果格式无效。"
    });
  });

  it("replaces pending candidates before writing extracted questions", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      materialQuestionCandidate: {
        deleteMany: async (args: unknown) => {
          calls.push({ method: "deleteMany", args });
          return { count: 1 };
        },
        createMany: async (args: unknown) => {
          calls.push({ method: "createMany", args });
          return { count: 1 };
        }
      }
    };

    await createMaterialQuestionCandidates(
      "material_1",
      "job_1",
      [
        {
          stem: "事务原子性最准确的含义是什么？",
          options: {
            A: "全部成功或全部失败",
            B: "并发事务互不影响",
            C: "提交后永久保存",
            D: "数据满足约束"
          },
          answer: "A",
          explanation: "原子性要求事务作为不可分割的工作单元。",
          difficulty: 2,
          knowledgeNodeId: "node_1",
          sourceRef: "第 1 段"
        }
      ],
      db as never
    );
    expect(calls[0]).toEqual({
      method: "deleteMany",
      args: {
        where: {
          materialId: "material_1",
          status: "pending"
        }
      }
    });
    expect(calls[1]).toMatchObject({
      method: "createMany",
      args: {
        data: [
          expect.objectContaining({
            materialId: "material_1",
            jobId: "job_1",
            stem: "事务原子性最准确的含义是什么？"
          })
        ]
      }
    });
  });
});
