import { describe, expect, it } from "vitest";
import { savePrimaryExamGoal, validateSlug } from "@openexam/core/exam-core";

describe("exam core validation", () => {
  it("normalizes valid slugs", () => {
    expect(validateSlug(" Software-Designer-2026 ")).toEqual({
      ok: true,
      slug: "software-designer-2026"
    });
  });

  it("rejects unsafe slugs", () => {
    const result = validateSlug("software designer");

    expect(result.ok).toBe(false);
  });
});

describe("savePrimaryExamGoal", () => {
  it("updates the existing primary goal and demotes duplicate primary goals", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const tx = createGoalTx(calls, { id: "goal_1" });
    const db = {
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx)
    };

    await expect(
      savePrimaryExamGoal(
        "user_1",
        {
          programId: "program_1",
          dailyMinutes: "90"
        },
        db as never
      )
    ).resolves.toEqual({ ok: true });

    expect(calls).toContainEqual({
      method: "updateMany",
      args: {
        where: {
          userId: "user_1",
          isPrimary: true,
          id: { not: "goal_1" }
        },
        data: { isPrimary: false }
      }
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "update",
        args: expect.objectContaining({
          where: { id: "goal_1" },
          data: expect.objectContaining({
            userId: "user_1",
            programId: "program_1",
            dailyMinutes: 90,
            isPrimary: true
          })
        })
      })
    );
  });

  it("creates a primary goal when the user has none", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const tx = createGoalTx(calls, null);
    const db = {
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx)
    };

    await expect(
      savePrimaryExamGoal(
        "user_1",
        {
          programId: "program_1"
        },
        db as never
      )
    ).resolves.toEqual({ ok: true });

    expect(calls).toContainEqual({
      method: "updateMany",
      args: {
        where: {
          userId: "user_1",
          isPrimary: true
        },
        data: { isPrimary: false }
      }
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "create",
        args: expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_1",
            programId: "program_1",
            dailyMinutes: 60,
            isPrimary: true
          })
        })
      })
    );
  });
});

function createGoalTx(calls: { method: string; args?: unknown }[], existingPrimary: { id: string } | null) {
  return {
    examProgram: {
      findUnique: async () => ({ id: "program_1" })
    },
    examTrack: {
      findUnique: async () => null
    },
    examCycle: {
      findUnique: async () => null
    },
    subject: {
      findUnique: async () => null
    },
    examGoal: {
      findFirst: async () => {
        calls.push({ method: "findFirst" });
        return existingPrimary;
      },
      updateMany: async (args: unknown) => {
        calls.push({ method: "updateMany", args });
        return { count: 1 };
      },
      update: async (args: unknown) => {
        calls.push({ method: "update", args });
        return args;
      },
      create: async (args: unknown) => {
        calls.push({ method: "create", args });
        return args;
      }
    }
  };
}
