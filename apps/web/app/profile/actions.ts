"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { deleteUserProviderKey, saveUserProviderKey } from "@openexam/core/ai";
import { requireWebSession } from "@/lib/auth";

export async function saveOpenAiKeyAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await saveUserProviderKey(session.user.id, {
    provider: "openai",
    apiKey: value(formData, "apiKey")
  });

  finish(result, "OpenAI API Key 已保存。");
}

export async function deleteOpenAiKeyAction() {
  const session = await requireWebSession();
  const result = await deleteUserProviderKey(session.user.id, "openai");

  finish(result, "OpenAI API Key 已删除。");
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: { ok: true } | { ok: false; error: string }, success: string): never {
  revalidatePath("/profile" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/profile?${params}` as Route);
}
