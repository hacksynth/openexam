"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  confirmAttemptAnswerScore,
  pausePaperAttempt,
  resumePaperAttempt,
  savePaperAttemptAnswer,
  submitPaperAttempt
} from "@openexam/core/papers";
import { collectQuestionForReview } from "@openexam/core/practice";
import { requireWebSession } from "@/lib/auth";

export async function submitPaperAttemptAction(formData: FormData) {
  const session = await requireWebSession();
  const paperId = String(formData.get("paperId") ?? "");
  const attemptId = String(formData.get("attemptId") ?? "");
  const questionIds = formData.getAll("questionId").map((item) => String(item));
  const answers = Object.fromEntries(questionIds.map((questionId) => [questionId, String(formData.get(`answer_${questionId}`) ?? "")]));
  const result = await submitPaperAttempt(session.user.id, {
    paperId,
    attemptId,
    answers
  });

  revalidatePath("/papers" as Route);
  revalidatePath("/attempts" as Route);
  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/dashboard" as Route);

  if (!result.ok) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/attempts/${result.data.attemptId}?notice=${encodeURIComponent(`试卷已提交，得分 ${result.data.totalScore} / ${result.data.maxScore}。`)}` as Route);
}

export async function autosavePaperAttemptAction(input: { attemptId: string; questionId: string; answer: string }) {
  const session = await requireWebSession();

  return savePaperAttemptAnswer(session.user.id, input);
}

export async function pausePaperAttemptAction(formData: FormData) {
  const session = await requireWebSession();
  const paperId = String(formData.get("paperId") ?? "");
  const saved = await savePaperAnswersFromForm(session.user.id, formData);

  if (!saved.ok) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent(saved.error)}` as Route);
  }

  const result = await pausePaperAttempt(session.user.id, String(formData.get("attemptId") ?? ""));

  revalidatePath(`/papers/${paperId}` as Route);

  if (!result.ok) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/papers/${paperId}?notice=${encodeURIComponent("试卷已暂停。")}` as Route);
}

async function savePaperAnswersFromForm(userId: string, formData: FormData) {
  const attemptId = String(formData.get("attemptId") ?? "");
  const questionIds = formData.getAll("questionId").map((item) => String(item));

  for (const questionId of questionIds) {
    const result = await savePaperAttemptAnswer(userId, {
      attemptId,
      questionId,
      answer: String(formData.get(`answer_${questionId}`) ?? "")
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true } as const;
}

export async function resumePaperAttemptAction(formData: FormData) {
  const session = await requireWebSession();
  const paperId = String(formData.get("paperId") ?? "");
  const result = await resumePaperAttempt(session.user.id, String(formData.get("attemptId") ?? ""));

  revalidatePath(`/papers/${paperId}` as Route);

  if (!result.ok) {
    redirect(`/papers/${paperId}?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/papers/${paperId}?notice=${encodeURIComponent("试卷已恢复。")}` as Route);
}

export async function confirmAttemptAnswerScoreAction(formData: FormData) {
  const session = await requireWebSession();
  const attemptId = String(formData.get("attemptId") ?? "");
  const result = await confirmAttemptAnswerScore(session.user.id, {
    attemptAnswerId: String(formData.get("attemptAnswerId") ?? ""),
    score: String(formData.get("score") ?? "")
  });

  revalidatePath(`/attempts/${attemptId}` as Route);
  revalidatePath("/wrong-notes" as Route);

  if (!result.ok) {
    redirect(`/attempts/${attemptId}?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/attempts/${attemptId}?notice=${encodeURIComponent("分数已确认。")}` as Route);
}

export async function collectAttemptQuestionAction(formData: FormData) {
  const session = await requireWebSession();
  const attemptId = String(formData.get("attemptId") ?? "");
  const result = await collectQuestionForReview(session.user.id, {
    questionId: String(formData.get("questionId") ?? ""),
    attemptAnswerId: String(formData.get("attemptAnswerId") ?? "")
  });

  revalidatePath(`/attempts/${attemptId}` as Route);
  revalidatePath("/wrong-notes" as Route);

  if (!result.ok) {
    redirect(`/attempts/${attemptId}?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/attempts/${attemptId}?notice=${encodeURIComponent("题目已加入复习。")}` as Route);
}
