import { describe, expect, it } from "vitest";
import { buildPracticeQuestionGenerationPrompt, confirmGeneratedQuestionCandidate } from "@openexam/core/generated-questions";

describe("generated practice questions", () => {
  it("builds a strict JSON prompt with selected knowledge node", () => {
    const prompt = buildPracticeQuestionGenerationPrompt({
      goalPath: "软考 / 软件设计师",
      prompt: "数据库事务隔离级别",
      count: 3,
      selectedKnowledgeNodeId: "node_1",
      knowledgeNodes: [
        { id: "node_1", code: "DB-1", title: "事务" },
        { id: "node_2", code: "DB-2", title: "范式" }
      ]
    });

    expect(prompt.instructions).toContain("严格 JSON");
    expect(prompt.input).toContain("生成 3 道练习题候选");
    expect(prompt.input).toContain("优先知识点：node_1 DB-1 事务");
  });

  it("checks batch ownership before confirming a candidate", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      generatedQuestionCandidate: {
        findFirst: async (args: unknown) => {
          calls.push({ method: "generatedQuestionCandidate.findFirst", args });
          return null;
        }
      }
    };

    await expect(confirmGeneratedQuestionCandidate("user_1", { candidateId: " candidate_1 " }, db as never)).resolves.toEqual({
      ok: false,
      error: "候选题不存在。"
    });
    expect(calls[0]).toEqual({
      method: "generatedQuestionCandidate.findFirst",
      args: {
        where: {
          id: "candidate_1",
          batch: {
            userId: "user_1"
          }
        },
        include: {
          batch: true
        }
      }
    });
  });
});
