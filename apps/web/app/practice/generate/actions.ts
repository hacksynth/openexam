"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { confirmGeneratedQuestionCandidate, generatePracticeQuestionCandidates, rejectGeneratedQuestionCandidate } from "@openexam/core/generated-questions";
import { requireWebSession } from "@/lib/auth";

export async function generatePracticeQuestionCandidatesAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await generatePracticeQuestionCandidates(session.user.id, {
    prompt: value(formData, "prompt"),
    count: value(formData, "count"),
    knowledgeNodeId: value(formData, "knowledgeNodeId")
  });

  revalidatePath("/practice/generate" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`/practice/generate?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/practice/generate?notice=${encodeURIComponent(`已生成 ${result.data.candidateCount} 道候选题。`)}` as Route);
}

export async function confirmGeneratedQuestionCandidateAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await confirmGeneratedQuestionCandidate(session.user.id, {
    candidateId: value(formData, "candidateId"),
    knowledgeNodeId: value(formData, "knowledgeNodeId")
  });

  revalidatePath("/practice/generate" as Route);
  revalidatePath("/practice" as Route);

  if (!result.ok) {
    redirect(`/practice/generate?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/practice/generate?notice=${encodeURIComponent("候选题已进入私有题库。")}` as Route);
}

export async function rejectGeneratedQuestionCandidateAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await rejectGeneratedQuestionCandidate(session.user.id, value(formData, "candidateId"));

  revalidatePath("/practice/generate" as Route);

  if (!result.ok) {
    redirect(`/practice/generate?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/practice/generate?notice=${encodeURIComponent("候选题已忽略。")}` as Route);
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}
