"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireWebSession } from "@/lib/auth";
import { generateStudyPlan, setStudyPlanTaskCompleted } from "@openexam/core/study-plan";

export async function generateStudyPlanAction() {
  const session = await requireWebSession();
  const result = await generateStudyPlan(session.user.id);

  revalidatePath("/plan" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`/plan?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/plan?notice=${encodeURIComponent("学习计划已生成。")}` as Route);
}

export async function setStudyPlanTaskCompletedAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await setStudyPlanTaskCompleted(session.user.id, String(formData.get("taskId") ?? ""), String(formData.get("completed") ?? "") === "true");

  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(`/plan?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/plan?notice=${encodeURIComponent("计划任务已更新。")}` as Route);
}
