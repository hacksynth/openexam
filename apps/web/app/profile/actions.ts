"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { deleteUserProviderKey, saveUserProviderKey } from "@openexam/core/ai";
import { requireWebSession } from "@/lib/auth";

export async function saveOpenAiKeyAction(formData: FormData) {
  const session = await requireWebSession();
  const provider = value(formData, "provider") || "openai";
  const result = await saveUserProviderKey(session.user.id, {
    provider,
    apiKey: value(formData, "apiKey")
  });

  finish(result, `${providerLabel(provider)} API Key 已保存。`);
}

export async function deleteOpenAiKeyAction(formData?: FormData) {
  const session = await requireWebSession();
  const result = await deleteUserProviderKey(session.user.id, valueFromProvider(formData) || "openai");

  finish(result, `${providerLabel(valueFromProvider(formData) || "openai")} API Key 已删除。`);
}

export async function deleteProviderKeyAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await deleteUserProviderKey(session.user.id, value(formData, "provider"));

  finish(result, `${providerLabel(value(formData, "provider"))} API Key 已删除。`);
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function valueFromProvider(value: unknown) {
  return value instanceof FormData ? String(value.get("provider") ?? "") : "";
}

function providerLabel(provider: string) {
  return { openai: "OpenAI", anthropic: "Claude", gemini: "Gemini" }[provider] ?? "AI";
}

function finish(result: { ok: true } | { ok: false; error: string }, success: string): never {
  revalidatePath("/profile" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/profile?${params}` as Route);
}
