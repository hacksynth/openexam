"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { generateKnowledgeExplanation, saveKnowledgeNote } from "@openexam/core/knowledge";
import { requireWebSession } from "@/lib/auth";

export async function saveKnowledgeNoteAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await saveKnowledgeNote(session.user.id, {
    knowledgeNodeId: value(formData, "knowledgeNodeId"),
    note: value(formData, "note")
  });

  revalidatePath("/knowledge" as Route);

  if (!result.ok) {
    redirect(`/knowledge?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect("/knowledge?notice=%E7%9F%A5%E8%AF%86%E7%82%B9%E7%AC%94%E8%AE%B0%E5%B7%B2%E4%BF%9D%E5%AD%98%E3%80%82" as Route);
}

export async function generateKnowledgeExplanationAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await generateKnowledgeExplanation(session.user.id, value(formData, "knowledgeNodeId"));

  revalidatePath("/knowledge" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(`/knowledge?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect("/knowledge?notice=AI%20%E7%9F%A5%E8%AF%86%E7%82%B9%E8%A7%A3%E9%87%8A%E5%B7%B2%E7%94%9F%E6%88%90%E3%80%82" as Route);
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}
