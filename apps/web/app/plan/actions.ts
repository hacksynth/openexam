"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireWebSession } from "@/lib/auth";
import { abandonCurrentStudyPlan, generateStudyPlan, setStudyPlanTaskCompleted, skipStudyPlanTask } from "@openexam/core/study-plan";

export async function generateStudyPlanAction() {
  const session = await requireWebSession();
  const result = await generateStudyPlan(session.user.id);

  revalidatePath("/plan" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`/plan?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/plan?notice=${encodeURIComponent(result.data.action === "adjusted" ? "后续计划已调整。" : "学习计划已生成。")}` as Route);
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

export async function skipStudyPlanTaskAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await skipStudyPlanTask(session.user.id, String(formData.get("taskId") ?? ""));

  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(`/plan?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/plan?notice=${encodeURIComponent("计划任务已跳过。")}` as Route);
}

export async function abandonCurrentStudyPlanAction() {
  const session = await requireWebSession();
  const result = await abandonCurrentStudyPlan(session.user.id);

  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(`/plan?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/plan?notice=${encodeURIComponent("学习计划已放弃。")}` as Route);
}
