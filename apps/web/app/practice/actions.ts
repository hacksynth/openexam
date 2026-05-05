"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { collectQuestionForReview, submitPracticeAnswer } from "@openexam/core/practice";
import { requireWebSession } from "@/lib/auth";

export async function submitPracticeAnswerAction(formData: FormData) {
  const session = await requireWebSession();
  const materialId = optionalText(String(formData.get("materialId") ?? ""));
  const answer = formData
    .getAll("answer")
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(",");
  const result = await submitPracticeAnswer(session.user.id, {
    questionId: String(formData.get("questionId") ?? ""),
    answer,
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

export async function submitSingleChoiceAnswerAction(formData: FormData) {
  return submitPracticeAnswerAction(formData);
}

export async function collectPracticeQuestionAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await collectQuestionForReview(session.user.id, {
    questionId: value(formData, "questionId"),
    attemptAnswerId: optionalText(value(formData, "attemptAnswerId")) || undefined
  });

  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/practice" as Route);

  if (!result.ok) {
    redirect(practiceRedirect({ error: result.error }));
  }

  redirect(practiceRedirect({ attemptId: value(formData, "attemptId") || undefined, materialId: optionalText(value(formData, "materialId")) }));
}

function optionalText(value: string) {
  const text = value.trim();

  return text || null;
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
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
