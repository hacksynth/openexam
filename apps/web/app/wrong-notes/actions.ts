"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { generateWrongNoteAiAnalysis } from "@openexam/core/ai";
import { setWrongNoteMastered, updateWrongNoteReflection } from "@openexam/core/practice";
import { queueWrongNoteReviewCard } from "@openexam/core/wrong-note-images";
import { requireWebSession } from "@/lib/auth";

export async function setWrongNoteMasteredAction(formData: FormData) {
  const session = await requireWebSession();
  const returnTo = safeWrongNotesReturnTo(String(formData.get("returnTo") ?? ""));
  const result = await setWrongNoteMastered(session.user.id, String(formData.get("wrongNoteId") ?? ""), String(formData.get("mastered") ?? "") === "true");

  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/dashboard" as Route);
  revalidatePath("/analysis" as Route);
  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=${encodeURIComponent("错题状态已更新。")}` as Route);
}

export async function updateWrongNoteReflectionAction(formData: FormData) {
  const session = await requireWebSession();
  const returnTo = safeWrongNotesReturnTo(String(formData.get("returnTo") ?? ""));
  const result = await updateWrongNoteReflection(session.user.id, {
    wrongNoteId: String(formData.get("wrongNoteId") ?? ""),
    mistakeTags: String(formData.get("mistakeTags") ?? ""),
    userNotes: String(formData.get("userNotes") ?? "")
  });

  revalidatePath("/wrong-notes" as Route);

  if (!result.ok) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=${encodeURIComponent("错题笔记已保存。")}` as Route);
}

export async function generateWrongNoteAiAnalysisAction(formData: FormData) {
  const session = await requireWebSession();
  const returnTo = safeWrongNotesReturnTo(String(formData.get("returnTo") ?? ""));
  const result = await generateWrongNoteAiAnalysis(session.user.id, String(formData.get("wrongNoteId") ?? ""));

  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=${encodeURIComponent("AI 解析已生成。")}` as Route);
}

export async function queueWrongNoteReviewCardAction(formData: FormData) {
  const session = await requireWebSession();
  const returnTo = safeWrongNotesReturnTo(String(formData.get("returnTo") ?? ""));
  const result = await queueWrongNoteReviewCard(session.user.id, String(formData.get("wrongNoteId") ?? ""));

  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=${encodeURIComponent("复习卡图片任务已加入队列。")}` as Route);
}

function safeWrongNotesReturnTo(value: string) {
  return value === "/wrong-notes" || value.startsWith("/wrong-notes?") ? value : "/wrong-notes";
}
