"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { savePrimaryExamGoal } from "@openexam/core/exam-core";
import { requireWebSession } from "@/lib/auth";

export async function savePrimaryGoalAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await savePrimaryExamGoal(session.user.id, {
    programId: value(formData, "programId"),
    trackId: value(formData, "trackId"),
    cycleId: value(formData, "cycleId"),
    subjectId: value(formData, "subjectId"),
    targetDate: value(formData, "targetDate"),
    targetScore: value(formData, "targetScore"),
    dailyMinutes: value(formData, "dailyMinutes")
  });

  revalidatePath("/goals" as Route);
  revalidatePath("/dashboard" as Route);

  const params = result.ok ? "notice=%E8%80%83%E8%AF%95%E7%9B%AE%E6%A0%87%E5%B7%B2%E4%BF%9D%E5%AD%98%E3%80%82" : `error=${encodeURIComponent(result.error)}`;
  redirect(`/goals?${params}` as Route);
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}
