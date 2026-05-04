"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { submitPaperAttempt } from "@openexam/core/papers";
import { requireWebSession } from "@/lib/auth";

export async function submitPaperAttemptAction(formData: FormData) {
  const session = await requireWebSession();
  const paperId = String(formData.get("paperId") ?? "");
  const questionIds = formData.getAll("questionId").map((item) => String(item));
  const answers = Object.fromEntries(questionIds.map((questionId) => [questionId, String(formData.get(`answer_${questionId}`) ?? "")]));
  const result = await submitPaperAttempt(session.user.id, {
    paperId,
    answers
  });

  revalidatePath("/papers" as Route);
  revalidatePath("/attempts" as Route);
  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/dashboard" as Route);

  if (!result.ok) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/attempts?notice=${encodeURIComponent(`试卷已提交，得分 ${result.data.totalScore} / ${result.data.maxScore}。`)}` as Route);
}
