import { describe, expect, it } from "vitest";
import {
  buildStudyPlanPrompt,
  generateStudyPlan,
  parseStudyPlanAiOutput,
  setStudyPlanTaskCompleted
} from "@openexam/core/study-plan";

describe("study plan generation", () => {
  it("builds prompts from goal and weak knowledge data", () => {
    const prompt = buildStudyPlanPrompt(analysisState());

    expect(prompt.instructions).toContain("严格 JSON");
    expect(prompt.input).toContain("目标 ID：goal_1");
    expect(prompt.input).toContain("事务基础");
    expect(prompt.input).toContain("未掌握错题3");
  });

  it("validates strict AI plan JSON", () => {
    expect(parseStudyPlanAiOutput(JSON.stringify(planPayload()))).toEqual({
      ok: true,
      data: planPayload()
    });
    expect(parseStudyPlanAiOutput("Study harder.")).toEqual({
      ok: false,
      error: "AI 学习计划不是有效 JSON。"
    });
    expect(
      parseStudyPlanAiOutput(
        JSON.stringify({
          ...planPayload(),
          tasks: Array.from({ length: 14 }, () => ({
            day: 1,
            title: "集中练习事务基础",
            kind: "practice",
            minutes: 45,
            knowledgeNodeIds: ["node_db"]
          }))
        })
      )
    ).toEqual({
      ok: false,
      error: "AI 学习计划需要覆盖 14 天。"
    });
  });

  it("archives old active plans and saves the generated plan", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createStudyPlanDb(calls);

    await expect(
      generateStudyPlan("user_1", {
        db: db as never,
        generateText: async () => ({ text: JSON.stringify(planPayload()), usage: { total_tokens: 120 } })
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        planId: "plan_1",
        aiCallId: "call_1"
      }
    });
    expect(calls).toContainEqual(expect.objectContaining({ method: "studyPlan.updateMany" }));
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "studyPlan.create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_1",
            goalId: "goal_1",
            status: "active"
          })
        })
      })
    );
  });

  it("does not archive existing plans when AI output is invalid", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createStudyPlanDb(calls);

    await expect(
      generateStudyPlan("user_1", {
        db: db as never,
        generateText: async () => ({ text: "not json" })
      })
    ).resolves.toEqual({
      ok: false,
      error: "AI 学习计划不是有效 JSON。"
    });
    expect(calls.some((call) => call.method === "studyPlan.updateMany")).toBe(false);
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "aiCall.update",
        args: expect.objectContaining({
          data: expect.objectContaining({
            status: "failed"
          })
        })
      })
    );
  });

  it("updates only tasks owned by the current user's active plan", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      studyPlanTask: {
        updateMany: async (args: unknown) => {
          calls.push({ method: "studyPlanTask.updateMany", args });
          return { count: 1 };
        }
      }
    };

    await expect(setStudyPlanTaskCompleted("user_1", "task_1", true, db as never)).resolves.toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      method: "studyPlanTask.updateMany",
      args: {
        where: {
          id: "task_1",
          plan: {
            userId: "user_1",
            status: "active"
          }
        }
      }
    });
  });
});

function createStudyPlanDb(calls: { method: string; args?: unknown }[]) {
  return {
    examGoal: {
      findFirst: async () => analysisState().goal
    },
    attempt: {
      findMany: async () => [
        {
          id: "attempt_1",
          paperId: null,
          paper: null,
          submittedAt: new Date("2026-05-05T00:00:00.000Z"),
          createdAt: new Date("2026-05-05T00:00:00.000Z"),
          totalScore: 0,
          maxScore: 1,
          answers: [
            {
              isCorrect: false,
              score: 0,
              maxScore: 1,
              userAnswer: { value: "B" },
              question: {
                knowledgeBindings: [
                  {
                    knowledgeNodeId: "node_db",
                    knowledgeNode: {
                      title: "事务基础"
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    },
    wrongNote: {
      findMany: async () => [
        {
          mastered: false,
          question: {
            knowledgeBindings: [
              {
                knowledgeNodeId: "node_db",
                knowledgeNode: {
                  title: "事务基础"
                }
              }
            ]
          }
        }
      ]
    },
    aiProviderPreset: {
      findFirst: async () => ({
        model: "gpt-5.5",
        maxTokens: 1800,
        temperature: null
      })
    },
    aiCall: {
      create: async (args: unknown) => {
        calls.push({ method: "aiCall.create", args });
        return { id: "call_1" };
      },
      update: async (args: unknown) => {
        calls.push({ method: "aiCall.update", args });
        return args;
      }
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        studyPlan: {
          updateMany: async (args: unknown) => {
            calls.push({ method: "studyPlan.updateMany", args });
            return { count: 1 };
          },
          create: async (args: unknown) => {
            calls.push({ method: "studyPlan.create", args });
            return { id: "plan_1" };
          }
        }
      })
  };
}

function analysisState() {
  const now = new Date("2026-05-05T00:00:00.000Z");

  return {
    status: "ready" as const,
    goalPath: "软考 / 软件设计师 / 2026 上半年 / 基础知识",
    goal: {
      id: "goal_1",
      userId: "user_1",
      programId: "program_1",
      trackId: "track_1",
      cycleId: "cycle_1",
      subjectId: "subject_1",
      targetDate: now,
      targetScore: 60,
      dailyMinutes: 45,
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
      track: {
        id: "track_1",
        programId: "program_1",
        name: "软件设计师",
        slug: "software-designer",
        level: "中级",
        createdAt: now,
        updatedAt: now
      },
      cycle: {
        id: "cycle_1",
        trackId: "track_1",
        name: "2026 上半年",
        slug: "2026-h1",
        startsAt: null,
        examDate: now,
        createdAt: now,
        updatedAt: now
      },
      subject: {
        id: "subject_1",
        cycleId: "cycle_1",
        name: "基础知识",
        slug: "basic-knowledge",
        description: null,
        createdAt: now,
        updatedAt: now
      }
    },
    summary: {
      totalQuestions: 10,
      correctCount: 5,
      wrongCount: 5,
      unansweredCount: 0,
      totalScore: 5,
      maxScore: 10,
      accuracy: 50,
      scoreRate: 50,
      pendingWrongNotes: 3,
      masteredWrongNotes: 1,
      weakKnowledgeNodes: [
        {
          id: "node_db",
          title: "事务基础",
          total: 4,
          correct: 1,
          wrong: 3,
          unanswered: 0,
          score: 1,
          maxScore: 4,
          accuracy: 25,
          scoreRate: 25,
          pendingWrongNotes: 3
        }
      ]
    },
    recentAttempts: []
  };
}

function planPayload() {
  return {
    goalId: "goal_1",
    generatedAt: "2026-05-05T00:00:00.000Z",
    days: 14,
    tasks: Array.from({ length: 14 }, (_, index) => ({
      day: index + 1,
      title: `第 ${index + 1} 天复习事务基础`,
      kind: "practice" as const,
      minutes: 45,
      knowledgeNodeIds: ["node_db"]
    }))
  };
}
