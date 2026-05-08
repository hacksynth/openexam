import { formatDateInput } from "@openexam/core/exam-core";

export type GoalSearchParams = {
  cycleId?: string;
  programId?: string;
  subjectId?: string;
  trackId?: string;
};

export type GoalFormPrimaryGoal = {
  cycleId: string | null;
  dailyMinutes: number;
  programId: string;
  subjectId: string | null;
  targetDate: Date | null;
  targetScore: number | null;
  trackId: string | null;
};

export function resolveGoalFormDefaults(params: GoalSearchParams, primaryGoal: GoalFormPrimaryGoal | null | undefined) {
  const hasPrefill = Boolean(params.programId || params.trackId || params.cycleId || params.subjectId);
  const prefillMatchesPrimary =
    hasPrefill &&
    Boolean(primaryGoal) &&
    (!params.programId || params.programId === primaryGoal?.programId) &&
    (!params.trackId || params.trackId === primaryGoal?.trackId) &&
    (!params.cycleId || params.cycleId === primaryGoal?.cycleId) &&
    (!params.subjectId || params.subjectId === primaryGoal?.subjectId);
  const preservePrimaryDetails = !hasPrefill || prefillMatchesPrimary;

  return {
    programId: resolveScopeDefault(params.programId, primaryGoal?.programId, hasPrefill, preservePrimaryDetails),
    trackId: resolveScopeDefault(params.trackId, primaryGoal?.trackId, hasPrefill, preservePrimaryDetails),
    cycleId: resolveScopeDefault(params.cycleId, primaryGoal?.cycleId, hasPrefill, preservePrimaryDetails),
    subjectId: resolveScopeDefault(params.subjectId, primaryGoal?.subjectId, hasPrefill, preservePrimaryDetails),
    targetDate: preservePrimaryDetails ? formatDateInput(primaryGoal?.targetDate) : "",
    targetScore: preservePrimaryDetails ? primaryGoal?.targetScore ?? "" : "",
    dailyMinutes: preservePrimaryDetails ? primaryGoal?.dailyMinutes ?? 60 : 60
  };
}

function resolveScopeDefault(
  paramValue: string | undefined,
  primaryValue: string | null | undefined,
  hasPrefill: boolean,
  preservePrimaryDetails: boolean
) {
  if (!hasPrefill) {
    return primaryValue ?? "";
  }

  if (paramValue) {
    return paramValue;
  }

  return preservePrimaryDetails ? primaryValue ?? "" : "";
}
