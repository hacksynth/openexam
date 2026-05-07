import { describe, expect, it } from "vitest";
import {
  buildStudyPlanPrompt,
  buildStudyPlanWindow,
  generateStudyPlan,
  parseStudyPlanAiOutput,
  setStudyPlanTaskCompleted,
  skipStudyPlanTask
} from "@openexam/core/study-plan";

const now = new Date("2026-05-05T00:00:00.000Z");
const targetDate = new Date("2026-05-18T00:00:00.000Z");

describe("study plan generation", () => {
  it("builds prompts from goal, window, and weak knowledge data", () => {
    const window = buildStudyPlanWindow(targetDate, now);

    expect(window.ok).toBe(true);
    const prompt = buildStudyPlanPrompt(analysisState(), { window: window.ok ? window.data : undefined });

    expect(prompt.instructions).toContain("严格 JSON");
    expect(prompt.input).toContain("目标 ID：goal_1");
    expect(prompt.input).toContain("计划窗口：2026-05-05 至 2026-05-18");
    expect(prompt.input).toContain("事务基础");
    expect(prompt.input).toContain("未掌握错题3");
    expect(prompt.input).toContain("待巩固题：2");
  });

  it("supports baseline plans before the learner has practice data", () => {
    const state = analysisState();
    state.summary.totalQuestions = 0;
    state.summary.weakKnowledgeNodes = [];
    const window = buildStudyPlanWindow(targetDate, now);
    const prompt = buildStudyPlanPrompt(state, { window: window.ok ? window.data : undefined });

    expect(prompt.input).toContain("暂无作答数据");
  });

  it("requires target dates after today and caps the plan window at 30 days", () => {
    expect(buildStudyPlanWindow(null, now)).toEqual({ ok: false, error: "请先在考试目标中保存考试日期。" });
    expect(buildStudyPlanWindow(new Date("2026-05-04T00:00:00.000Z"), now)).toEqual({ ok: false, error: "考试日期已过，请更新目标日期。" });
    expect(buildStudyPlanWindow(now, now)).toEqual({ ok: false, error: "考试日期是今天，建议直接进入练习或错题复盘。" });
    expect(buildStudyPlanWindow(new Date("2026-05-06T00:00:00.000Z"), now)).toMatchObject({
      ok: true,
      data: {
        days: 2
      }
    });
    expect(buildStudyPlanWindow(new Date("2026-08-20T00:00:00.000Z"), now)).toMatchObject({
      ok: true,
      data: {
        days: 30
      }
    });
  });

  it("validates strict AI plan JSON against the active window", () => {
    const validation = validationOptions();

    expect(parseStudyPlanAiOutput(JSON.stringify(planPayload()), validation)).toEqual({
      ok: true,
      data: planPayload()
    });
    expect(parseStudyPlanAiOutput("Study harder.", validation)).toEqual({
      ok: false,
      error: "AI 学习计划不是有效 JSON。"
    });
    expect(
      parseStudyPlanAiOutput(
        JSON.stringify({
          ...planPayload(),
          tasks: Array.from({ length: 14 }, (_, index) => ({
            day: 1,
            scheduledDate: `2026-05-${String(index + 5).padStart(2, "0")}`,
            title: "集中练习事务基础",
            kind: "practice",
            minutes: 45,
            knowledgeNodeIds: ["node_db"]
          }))
        }),
        validation
      )
    ).toEqual({
      ok: false,
      error: "AI 学习计划没有覆盖计划窗口内的每一天。"
    });
  });

  it("creates a new active plan with an initial revision", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createStudyPlanDb(calls);

    await expect(
      generateStudyPlan("user_1", {
        db: db as never,
        generateText: async () => ({ text: JSON.stringify(planPayload()), usage: { total_tokens: 120 } }),
        now
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        action: "generated",
        planId: "plan_1",
        aiCallId: "call_1"
      }
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "studyPlan.create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_1",
            goalId: "goal_1",
            status: "active",
            windowStartDate: new Date("2026-05-05T00:00:00.000Z"),
            windowEndDate: new Date("2026-05-18T00:00:00.000Z"),
            revisions: expect.objectContaining({
              create: expect.objectContaining({
                trigger: "initial_generate",
                revisionNumber: 1
              })
            })
          })
        })
      })
    );
  });

  it("does not persist placeholder optional relation ids from AI output", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createStudyPlanDb(calls);

    await generateStudyPlan("user_1", {
      db: db as never,
      generateText: async () => ({ text: JSON.stringify(planPayload({ relationPlaceholders: true })) }),
      now
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "studyPlan.create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            tasks: {
              createMany: {
                data: expect.arrayContaining([
                  expect.objectContaining({
                    subjectId: null,
                    knowledgeNodeIds: [],
                    paperId: null,
                    materialId: null
                  })
                ])
              }
            }
          })
        })
      })
    );
  });

  it("keeps valid optional relation ids from AI output", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createStudyPlanDb(calls);

    await generateStudyPlan("user_1", {
      db: db as never,
      generateText: async () => ({ text: JSON.stringify(planPayload({ validRelations: true })) }),
      now
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "studyPlan.create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            tasks: {
              createMany: {
                data: expect.arrayContaining([
                  expect.objectContaining({
                    subjectId: "cmvalidsubject123",
                    knowledgeNodeIds: ["cmvalidnode123"],
                    paperId: "cmvalidpaper123",
                    materialId: "cmvalidmaterial123"
                  })
                ])
              }
            }
          })
        })
      })
    );
  });

  it("adjusts the current active plan without creating a new plan", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createStudyPlanDb(calls, existingPlan());

    await expect(
      generateStudyPlan("user_1", {
        db: db as never,
        generateText: async () => ({ text: JSON.stringify(planPayload({ decisions: [{ taskId: "task_old", status: "carried_over", reason: "并入新计划" }] })) }),
        now
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        action: "adjusted",
        planId: "plan_existing",
        aiCallId: "call_1"
      }
    });
    expect(calls.some((call) => call.method === "studyPlan.create")).toBe(false);
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "studyPlanTask.updateMany",
        args: expect.objectContaining({
          where: expect.objectContaining({
            id: "task_old",
            status: "pending"
          }),
          data: {
            status: "carried_over"
          }
        })
      })
    );
    expect(calls).toContainEqual(expect.objectContaining({ method: "studyPlanRevision.create" }));
  });

  it("does not mutate plans when AI output is invalid", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createStudyPlanDb(calls);

    await expect(
      generateStudyPlan("user_1", {
        db: db as never,
        generateText: async () => ({ text: "not json" }),
        now
      })
    ).resolves.toEqual({
      ok: false,
      error: "AI 学习计划不是有效 JSON。"
    });
    expect(calls.some((call) => call.method.startsWith("studyPlanTask."))).toBe(false);
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
          status: {
            in: ["pending", "completed"]
          },
          plan: {
            userId: "user_1",
            status: "active"
          }
        },
        data: {
          completedAt: expect.any(Date),
          status: "completed"
        }
      }
    });
  });

  it("lets users skip pending tasks", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      studyPlanTask: {
        updateMany: async (args: unknown) => {
          calls.push({ method: "studyPlanTask.updateMany", args });
          return { count: 1 };
        }
      }
    };

    await expect(skipStudyPlanTask("user_1", "task_1", db as never)).resolves.toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      method: "studyPlanTask.updateMany",
      args: {
        where: {
          id: "task_1",
          status: "pending",
          plan: {
            userId: "user_1",
            status: "active"
          }
        },
        data: {
          completedAt: null,
          status: "skipped"
        }
      }
    });
  });
});

function createStudyPlanDb(calls: { method: string; args?: unknown }[], activePlan: ReturnType<typeof existingPlan> | null = null) {
  return {
    examGoal: {
      findFirst: async () => analysisState().goal
    },
    attemptAnswer: {
      findMany: async () => [
        {
          isCorrect: false,
          score: 0,
          maxScore: 1,
          userAnswer: { value: "B" },
          question: {
            kind: "single_choice",
            difficulty: 1,
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
    attempt: {
      findMany: async () => [
        {
          id: "attempt_1",
          paperId: null,
          paper: null,
          submittedAt: new Date("2026-05-05T00:00:00.000Z"),
          createdAt: new Date("2026-05-05T00:00:00.000Z"),
          totalScore: 0,
          maxScore: 1
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
    consolidationNote: {
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
    studyPlan: {
      findFirst: async () => activePlan
    },
    aiProviderPresetTask: {
      findUnique: async () => ({
        preset: {
          provider: "openai",
          model: "gpt-5.5",
          capabilities: ["json"],
          enabled: true,
          maxTokens: 1800,
          temperature: null
        }
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
          create: async (args: unknown) => {
            calls.push({ method: "studyPlan.create", args });
            return { id: "plan_1" };
          },
          update: async (args: unknown) => {
            calls.push({ method: "studyPlan.update", args });
            return args;
          }
        },
        studyPlanRevision: {
          findFirst: async () => ({ revisionNumber: 1 }),
          create: async (args: unknown) => {
            calls.push({ method: "studyPlanRevision.create", args });
            return args;
          }
        },
        studyPlanTask: {
          createMany: async (args: unknown) => {
            calls.push({ method: "studyPlanTask.createMany", args });
            return { count: 14 };
          },
          updateMany: async (args: unknown) => {
            calls.push({ method: "studyPlanTask.updateMany", args });
            return { count: 1 };
          }
        }
      })
  };
}

function analysisState() {
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
      targetDate,
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
        homepageSelectionLevel: "track" as const,
        createdAt: now,
        updatedAt: now
      },
      track: {
        id: "track_1",
        programId: "program_1",
        name: "软件设计师",
        slug: "software-designer",
        level: "中级",
        homepageStatus: "open" as const,
        homepageOrder: 10,
        homepageDescription: "当前完整备考方向，覆盖基础知识与应用技术。",
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
        homepageStatus: "hidden" as const,
        homepageOrder: 100,
        homepageDescription: null,
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
      pendingConsolidationNotes: 2,
      masteredConsolidationNotes: 0,
      masteryRiskCount: 5,
      byKind: [],
      byDifficulty: [],
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
          pendingWrongNotes: 3,
          pendingConsolidationNotes: 2
        }
      ]
    },
    recentAttempts: []
  };
}

function existingPlan() {
  return {
    id: "plan_existing",
    userId: "user_1",
    goalId: "goal_1",
    status: "active",
    generatedAt: now,
    windowStartDate: now,
    windowEndDate: targetDate,
    targetDateSnapshot: targetDate,
    dailyMinutesSnapshot: 45,
    lastAdjustedAt: now,
    sourceStats: null,
    createdAt: now,
    updatedAt: now,
    revisions: [{ revisionNumber: 1 }],
    goal: analysisState().goal,
    tasks: [
      {
        id: "task_old",
        planId: "plan_existing",
        day: 1,
        scheduledDate: now,
        title: "旧任务",
        kind: "practice",
        minutes: 30,
        status: "pending",
        subjectId: null,
        knowledgeNodeIds: ["node_db"],
        paperId: null,
        materialId: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

function planPayload(
  input: {
    decisions?: { reason?: string; status: "carried_over" | "skipped"; taskId: string }[];
    relationPlaceholders?: boolean;
    validRelations?: boolean;
  } = {}
) {
  return {
    goalId: "goal_1",
    generatedAt: "2026-05-05T00:00:00.000Z",
    days: 14,
    decisions: input.decisions ?? [],
    tasks: Array.from({ length: 14 }, (_, index) => ({
      day: index + 1,
      scheduledDate: `2026-05-${String(index + 5).padStart(2, "0")}`,
      title: `第 ${index + 1} 天复习事务基础`,
      kind: index === 13 ? ("knowledge_review" as const) : ("practice" as const),
      minutes: index === 13 ? 20 : 45,
      ...(input.relationPlaceholders
        ? {
            subjectId: "可选",
            knowledgeNodeIds: ["可选知识点ID"],
            paperId: "可选",
            materialId: "可选"
          }
        : input.validRelations
          ? {
              subjectId: "cmvalidsubject123",
              knowledgeNodeIds: ["cmvalidnode123"],
              paperId: "cmvalidpaper123",
              materialId: "cmvalidmaterial123"
            }
          : {
              knowledgeNodeIds: ["node_db"]
            })
    }))
  };
}

function validationOptions() {
  const window = buildStudyPlanWindow(targetDate, now);

  if (!window.ok) {
    throw new Error(window.error);
  }

  return {
    dailyMinutes: 45,
    expectedDays: window.data.days,
    targetDate: window.data.targetDate,
    windowEndDate: window.data.endDate,
    windowStartDate: window.data.startDate
  };
}
