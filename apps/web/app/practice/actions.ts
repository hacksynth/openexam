"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { submitSingleChoiceAnswer } from "@openexam/core/practice";
import { requireWebSession } from "@/lib/auth";

export async function submitSingleChoiceAnswerAction(formData: FormData) {
  const session = await requireWebSession();
  const materialId = optionalText(String(formData.get("materialId") ?? ""));
  const result = await submitSingleChoiceAnswer(session.user.id, {
    questionId: String(formData.get("questionId") ?? ""),
    answer: String(formData.get("answer") ?? ""),
    materialId,
    retry: String(formData.get("retry") ?? "") === "true"
  });

  revalidatePath("/practice" as Route);
  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/dashboard" as Route);

  if (!result.ok) {
    redirect(practiceRedirect({ error: result.error, materialId }));
  }

  redirect(practiceRedirect({ attemptId: result.attemptId, materialId }));
}

function optionalText(value: string) {
  const text = value.trim();

  return text || null;
}

function practiceRedirect(input: { attemptId?: string; error?: string; materialId?: string | null }) {
  const params = new URLSearchParams();

  if (input.materialId) {
    params.set("material", input.materialId);
  }

  if (input.attemptId) {
    params.set("attempt", input.attemptId);
  }

  if (input.error) {
    params.set("error", input.error);
  }

  const query = params.toString();

  return (query ? `/practice?${query}` : "/practice") as Route;
}
