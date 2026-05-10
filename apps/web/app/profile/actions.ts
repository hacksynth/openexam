"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { deleteUserProviderKey, listUserAiProviderModels, saveUserProviderKey, testUserAiProviderCredential } from "@openexam/core/ai";
import { requireWebSession } from "@/lib/auth";

export type AiCredentialActionState = {
  error?: string;
  models?: { id: string; label: string }[];
  notice?: string;
};

export async function saveProviderKeyAction(formData: FormData) {
  const session = await requireWebSession();
  const provider = value(formData, "provider") || "openai";
  const result = await saveUserProviderKey(session.user.id, {
    provider,
    apiKey: value(formData, "apiKey"),
    baseUrl: value(formData, "baseUrl"),
    apiMode: value(formData, "apiMode"),
    defaultModel: value(formData, "defaultModel")
  });

  finish(result, `${providerLabel(provider)} API Key 已保存。`);
}

export async function listProviderModelsAction(_previousState: AiCredentialActionState, formData: FormData): Promise<AiCredentialActionState> {
  const session = await requireWebSession();
  const provider = value(formData, "provider") || "openai";
  const result = await listUserAiProviderModels(session.user.id, {
    provider,
    apiKey: value(formData, "apiKey"),
    baseUrl: value(formData, "baseUrl"),
    apiMode: value(formData, "apiMode")
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    models: result.data.models,
    notice: result.data.models.length > 0 ? `${providerLabel(provider)} 已获取 ${result.data.models.length} 个模型。` : "未返回模型。"
  };
}

export async function testProviderKeyAction(_previousState: AiCredentialActionState, formData: FormData): Promise<AiCredentialActionState> {
  const session = await requireWebSession();
  const provider = value(formData, "provider") || "openai";
  const result = await testUserAiProviderCredential(session.user.id, {
    provider,
    apiKey: value(formData, "apiKey"),
    baseUrl: value(formData, "baseUrl"),
    apiMode: value(formData, "apiMode"),
    defaultModel: value(formData, "defaultModel"),
    testModel: value(formData, "defaultModel")
  });

  return result.ok ? { notice: `${providerLabel(provider)} 连接测试通过。` } : { error: result.error };
}

export async function saveOpenAiKeyAction(formData: FormData) {
  return saveProviderKeyAction(formData);
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
