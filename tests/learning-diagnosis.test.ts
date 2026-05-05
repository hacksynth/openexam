import { describe, expect, it } from "vitest";
import { parseLearningDiagnosisOutput } from "@openexam/core/ai-output-schemas";
import { buildLearningDiagnosisPrompt } from "@openexam/core/learning-diagnosis";

describe("learning diagnosis", () => {
  it("parses structured diagnosis JSON", () => {
    expect(
      parseLearningDiagnosisOutput(
        JSON.stringify({
          summary: "当前主要风险集中在数据库事务与错题复盘节奏。",
          weakKnowledgeNodeIds: ["node_1"],
          recommendations: ["复习事务隔离级别", "重做未掌握错题"]
        })
      )
    ).toEqual({
      ok: true,
      data: {
        summary: "当前主要风险集中在数据库事务与错题复盘节奏。",
        weakKnowledgeNodeIds: ["node_1"],
        recommendations: ["复习事务隔离级别", "重做未掌握错题"]
      }
    });
  });

  it("builds a bounded prompt from analysis statistics", () => {
    const prompt = buildLearningDiagnosisPrompt({
      status: "ready",
      goal: {
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
        createdAt: new Date("2026-05-05T00:00:00.000Z"),
        updatedAt: new Date("2026-05-05T00:00:00.000Z"),
        program: { id: "program_1", name: "软考", slug: "ruankao", description: null, createdAt: new Date(), updatedAt: new Date() },
        track: null,
        cycle: null,
        subject: null
      },
      goalPath: "软考",
      summary: {
        totalQuestions: 12,
        correctCount: 8,
        wrongCount: 4,
        unansweredCount: 1,
        totalScore: 8,
        maxScore: 12,
        accuracy: 67,
        scoreRate: 67,
        pendingWrongNotes: 3,
        masteredWrongNotes: 1,
        weakKnowledgeNodes: [
          {
            id: "node_1",
            title: "数据库事务",
            total: 4,
            correct: 1,
            wrong: 3,
            unanswered: 0,
            score: 1,
            maxScore: 4,
            accuracy: 25,
            scoreRate: 25,
            pendingWrongNotes: 2
          }
        ]
      },
      recentAttempts: []
    });

    expect(prompt.instructions).toContain("严格 JSON");
    expect(prompt.input).toContain("目标：软考");
    expect(prompt.input).toContain("node_1 数据库事务");
  });
});
