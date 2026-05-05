import { describe, expect, it } from "vitest";
import { getLearnerDashboard } from "@openexam/core/dashboard-data";

describe("getLearnerDashboard", () => {
  it("builds learner dashboard data from database records", async () => {
    const db = {
      wrongNote: {
        findMany: async () => [
          {
            mastered: false,
            question: {
              knowledgeBindings: [
                {
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
        findFirst: async () => ({
          generatedAt: new Date("2026-05-05T00:00:00.000Z"),
          tasks: [
            {
              id: "task_1",
              day: 1,
              title: "完成事务基础练习",
              kind: "practice",
              completedAt: null,
              createdAt: new Date("2026-05-05T00:00:00.000Z")
            }
          ]
        })
      },
      job: {
        findMany: async () => [
          {
            id: "job_1",
            type: "extract_material_questions",
            status: "queued",
            updatedAt: new Date("2026-05-05T01:00:00.000Z")
          }
        ]
      },
      aiCall: {
        findMany: async () => [
          {
            id: "call_1",
            taskType: "explain_question",
            status: "succeeded",
            updatedAt: new Date("2026-05-05T00:30:00.000Z")
          }
        ]
      },
      attempt: {
        findMany: async () => []
      }
    };

    await expect(getLearnerDashboard("user_1", db as never, new Date("2026-05-05T06:00:00.000Z"))).resolves.toMatchObject({
      metrics: [
        { label: "今日任务", value: "1" },
        { label: "待复习错题", value: "1" },
        { label: "薄弱知识点", value: "1" },
        { label: "AI 任务", value: "1" }
      ],
      todayTasks: [
        {
          id: "task_1",
          label: "完成事务基础练习",
          href: "/practice"
        }
      ],
      weakKnowledgeNodes: [
        {
          title: "事务基础",
          count: 1
        }
      ],
      recentJobs: [
        {
          id: "job_1",
          label: "资料题目抽取",
          statusLabel: "排队中"
        },
        {
          id: "call_1",
          label: "错题 AI 解析",
          statusLabel: "已完成"
        }
      ]
    });
  });
});
