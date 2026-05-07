"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { generateAttemptAnswerAiExplanation, generateQuestionExplanation } from "@openexam/core/ai";
import { confirmAttemptAnswerScore } from "@openexam/core/papers";
import { collectQuestionForConsolidation, submitPracticeAnswer } from "@openexam/core/practice";
import { requireWebSession } from "@/lib/auth";

export async function submitPracticeAnswerAction(formData: FormData) {
  const session = await requireWebSession();
  const materialId = optionalText(String(formData.get("materialId") ?? ""));
  const knowledgeNodeId = optionalText(String(formData.get("knowledgeNodeId") ?? ""));
  const practiceMode = optionalText(String(formData.get("practiceMode") ?? ""));
  const answer = formData
    .getAll("answer")
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(",");
  const result = await submitPracticeAnswer(session.user.id, {
    questionId: String(formData.get("questionId") ?? ""),
    answer,
    materialId,
    knowledgeNodeId,
    practiceMode,
    retry: String(formData.get("retry") ?? "") === "true"
  });

  revalidatePath("/practice" as Route);
  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/consolidation" as Route);
  revalidatePath("/dashboard" as Route);
  revalidatePath("/analysis" as Route);
  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(practiceRedirect({ error: result.error, materialId, knowledgeNodeId, practiceMode }));
  }

  redirect(practiceRedirect({ attemptId: result.attemptId, materialId, knowledgeNodeId, practiceMode }));
}

export async function submitSingleChoiceAnswerAction(formData: FormData) {
  return submitPracticeAnswerAction(formData);
}

export async function collectPracticeQuestionAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await collectQuestionForConsolidation(session.user.id, {
    questionId: value(formData, "questionId"),
    attemptAnswerId: optionalText(value(formData, "attemptAnswerId")) || undefined
  });

  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/consolidation" as Route);
  revalidatePath("/practice" as Route);
  revalidatePath("/dashboard" as Route);
  revalidatePath("/analysis" as Route);
  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(practiceRedirect({ error: result.error }));
  }

  redirect(
    practiceRedirect({
      attemptId: value(formData, "attemptId") || undefined,
      materialId: optionalText(value(formData, "materialId")),
      knowledgeNodeId: optionalText(value(formData, "knowledgeNodeId")),
      practiceMode: optionalText(value(formData, "practiceMode"))
    })
  );
}

export async function confirmPracticeAnswerScoreAction(formData: FormData) {
  const session = await requireWebSession();
  const materialId = optionalText(value(formData, "materialId"));
  const attemptId = value(formData, "attemptId");
  const result = await confirmAttemptAnswerScore(session.user.id, {
    attemptAnswerId: value(formData, "attemptAnswerId"),
    score: value(formData, "score")
  });

  revalidatePath("/practice" as Route);
  revalidatePath("/attempts" as Route);
  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/consolidation" as Route);
  revalidatePath("/dashboard" as Route);
  revalidatePath("/analysis" as Route);
  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(practiceRedirect({ attemptId, materialId, knowledgeNodeId: optionalText(value(formData, "knowledgeNodeId")), practiceMode: optionalText(value(formData, "practiceMode")), error: result.error }));
  }

  redirect(practiceRedirect({ attemptId, materialId, knowledgeNodeId: optionalText(value(formData, "knowledgeNodeId")), practiceMode: optionalText(value(formData, "practiceMode")) }));
}

export async function generatePracticeAnswerAiExplanationAction(formData: FormData) {
  const session = await requireWebSession();
  const materialId = optionalText(value(formData, "materialId"));
  const attemptId = value(formData, "attemptId");
  const result = await generateAttemptAnswerAiExplanation(session.user.id, value(formData, "attemptAnswerId"));

  revalidatePath("/practice" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(practiceRedirect({ attemptId, materialId, knowledgeNodeId: optionalText(value(formData, "knowledgeNodeId")), practiceMode: optionalText(value(formData, "practiceMode")), error: result.error }));
  }

  redirect(practiceRedirect({ attemptId, materialId, knowledgeNodeId: optionalText(value(formData, "knowledgeNodeId")), practiceMode: optionalText(value(formData, "practiceMode")) }));
}

export async function generateQuestionExplanationAction(formData: FormData) {
  const session = await requireWebSession();
  const questionId = value(formData, "questionId");
  const result = await generateQuestionExplanation(session.user.id, questionId);

  revalidatePath("/practice" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`/practice?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/practice?notice=${encodeURIComponent("题目解析已生成。")}` as Route);
}

function optionalText(value: string) {
  const text = value.trim();

  return text || null;
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function practiceRedirect(input: { attemptId?: string; error?: string; materialId?: string | null; knowledgeNodeId?: string | null; practiceMode?: string | null }) {
  const params = new URLSearchParams();

  if (input.practiceMode) {
    params.set("mode", input.practiceMode);
  }

  if (input.knowledgeNodeId) {
    params.set("knowledgeNodeId", input.knowledgeNodeId);
  }

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
