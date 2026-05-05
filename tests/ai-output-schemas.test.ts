import { describe, expect, it } from "vitest";
import {
  learningDiagnosisOutputSchema,
  materialQuestionExtractionSchema,
  parseSubjectiveGradingOutput,
  validateReviewCardImagePrompt
} from "@openexam/core/ai-output-schemas";

describe("AI output schemas", () => {
  it("validates material extraction envelopes before candidate storage", () => {
    expect(
      materialQuestionExtractionSchema.safeParse({
        questions: [
          {
            kind: "multiple_choice",
            stem: "事务特性包括哪些？",
            options: {
              A: "原子性",
              B: "一致性",
              C: "隔离性",
              D: "随机性"
            },
            answer: ["A", "B", "C"],
            difficulty: 2
          }
        ]
      }).success
    ).toBe(true);
    expect(materialQuestionExtractionSchema.safeParse({ questions: [] }).success).toBe(false);
    expect(
      materialQuestionExtractionSchema.safeParse({
        questions: Array.from({ length: 25 }, (_, index) => ({
          stem: `题干 ${index + 1}`,
          answer: "参考答案"
        }))
      }).success
    ).toBe(true);
  });

  it("rejects subjective grading scores above max score", () => {
    expect(parseSubjectiveGradingOutput('{"score":3,"reason":"覆盖主要要点"}', 5)).toEqual({
      ok: true,
      data: {
        score: 3,
        reason: "覆盖主要要点"
      }
    });
    expect(parseSubjectiveGradingOutput('{"score":6,"reason":"超分"}', 5)).toEqual({
      ok: false,
      error: "AI 主观题评分超过题目满分。"
    });
  });

  it("validates diagnosis and review-card prompt shapes", () => {
    expect(
      learningDiagnosisOutputSchema.safeParse({
        summary: "错题集中在事务基础。",
        weakKnowledgeNodeIds: ["node_1"],
        recommendations: ["复习 ACID 定义"]
      }).success
    ).toBe(true);
    expect(validateReviewCardImagePrompt("Create a clean vertical review card for this database transaction mistake.")).toEqual({
      ok: true,
      data: {
        prompt: "Create a clean vertical review card for this database transaction mistake."
      }
    });
  });
});
