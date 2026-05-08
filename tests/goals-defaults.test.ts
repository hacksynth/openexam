import { describe, expect, it } from "vitest";
import { resolveGoalFormDefaults, type GoalFormPrimaryGoal } from "../apps/web/app/goals/defaults";

const primaryGoal: GoalFormPrimaryGoal = {
  programId: "program_1",
  trackId: "track_1",
  cycleId: "cycle_1",
  subjectId: "subject_1",
  targetDate: new Date("2026-06-15T00:00:00.000Z"),
  targetScore: 80,
  dailyMinutes: 45
};

describe("resolveGoalFormDefaults", () => {
  it("preserves the current batch when a matching direction link omits cycleId", () => {
    expect(resolveGoalFormDefaults({ programId: "program_1", trackId: "track_1" }, primaryGoal)).toEqual({
      programId: "program_1",
      trackId: "track_1",
      cycleId: "cycle_1",
      subjectId: "subject_1",
      targetDate: "2026-06-15",
      targetScore: 80,
      dailyMinutes: 45
    });
  });

  it("clears missing scope fields when prefill points to another direction", () => {
    expect(resolveGoalFormDefaults({ programId: "program_1", trackId: "track_2" }, primaryGoal)).toEqual({
      programId: "program_1",
      trackId: "track_2",
      cycleId: "",
      subjectId: "",
      targetDate: "",
      targetScore: "",
      dailyMinutes: 60
    });
  });

  it("uses the current primary goal when there are no prefill params", () => {
    expect(resolveGoalFormDefaults({}, primaryGoal)).toEqual({
      programId: "program_1",
      trackId: "track_1",
      cycleId: "cycle_1",
      subjectId: "subject_1",
      targetDate: "2026-06-15",
      targetScore: 80,
      dailyMinutes: 45
    });
  });
});
