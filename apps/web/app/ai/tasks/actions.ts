"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { retryFailedAiCall } from "@openexam/core/ai";
import { requireWebSession } from "@/lib/auth";

export async function retryAiCallAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await retryFailedAiCall(session.user.id, String(formData.get("aiCallId") ?? ""));

  revalidatePath("/ai/tasks" as Route);
  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/attempts" as Route);
  revalidatePath("/practice" as Route);

  if (!result.ok) {
    redirect(`/ai/tasks?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/ai/tasks?notice=${encodeURIComponent("题目 AI 解析已重试成功。")}` as Route);
}
