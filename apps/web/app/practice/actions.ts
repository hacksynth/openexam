"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { submitSingleChoiceAnswer } from "@openexam/core/practice";
import { requireWebSession } from "@/lib/auth";

export async function submitSingleChoiceAnswerAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await submitSingleChoiceAnswer(session.user.id, {
    questionId: String(formData.get("questionId") ?? ""),
    answer: String(formData.get("answer") ?? "")
  });

  revalidatePath("/practice" as Route);
  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/dashboard" as Route);

  if (!result.ok) {
    redirect(`/practice?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/practice?attempt=${result.attemptId}` as Route);
}
