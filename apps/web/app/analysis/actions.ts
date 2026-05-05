"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { generateLearningDiagnosis } from "@openexam/core/learning-diagnosis";
import { requireWebSession } from "@/lib/auth";

export async function generateLearningDiagnosisAction() {
  const session = await requireWebSession();
  const result = await generateLearningDiagnosis(session.user.id);

  revalidatePath("/analysis" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`/analysis?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/analysis?notice=${encodeURIComponent("学习诊断已生成。")}` as Route);
}
