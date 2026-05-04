"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { setAiProviderPresetEnabled, upsertAiProviderPreset } from "@openexam/core/ai";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof upsertAiProviderPreset>>;

export async function upsertAiProviderPresetAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await upsertAiProviderPreset({
      id: value(formData, "id"),
      provider: value(formData, "provider"),
      model: value(formData, "model"),
      label: value(formData, "label"),
      defaultForTask: value(formData, "defaultForTask"),
      temperature: value(formData, "temperature"),
      maxTokens: value(formData, "maxTokens"),
      enabled: formData.has("enabled")
    }),
    "模型预设已保存。"
  );
}

export async function enableAiProviderPresetAction(formData: FormData) {
  await requireAdminSession();
  finish(await setAiProviderPresetEnabled(value(formData, "id"), true), "模型预设已启用。");
}

export async function disableAiProviderPresetAction(formData: FormData) {
  await requireAdminSession();
  finish(await setAiProviderPresetEnabled(value(formData, "id"), false), "模型预设已停用。");
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/ai" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/ai?${params}` as Route);
}
