import { describe, expect, it } from "vitest";
import { studyPlanSchema } from "@openexam/core/study-plan-schema";

describe("studyPlanSchema", () => {
  it("accepts structured 14-day plans", () => {
    const result = studyPlanSchema.safeParse({
      goalId: "goal_1",
      generatedAt: "2026-05-05T00:00:00.000Z",
      days: 14,
      tasks: [
        {
          day: 1,
          title: "Practice algorithm complexity",
          kind: "practice",
          minutes: 45,
          knowledgeNodeIds: ["node_1"]
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects free-form plans that are not task tables", () => {
    const result = studyPlanSchema.safeParse({
      goalId: "goal_1",
      generatedAt: "2026-05-05T00:00:00.000Z",
      text: "Study harder for two weeks."
    });

    expect(result.success).toBe(false);
  });
});
