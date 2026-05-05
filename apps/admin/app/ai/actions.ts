"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { setAiProviderPresetEnabled, upsertAiProviderPreset } from "@openexam/core/ai";
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof upsertAiProviderPreset>>;

export async function upsertAiProviderPresetAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await upsertAiProviderPreset({
      id: value(formData, "id"),
      provider: value(formData, "provider"),
      model: value(formData, "model"),
      label: value(formData, "label"),
      capabilities: formData.getAll("capabilities").map((item) => String(item)),
      defaultForTask: value(formData, "defaultForTask"),
      temperature: value(formData, "temperature"),
      maxTokens: value(formData, "maxTokens"),
      enabled: formData.has("enabled")
    });

  await auditIfOk(session.user.id, result, "ai_preset.upsert", id || null, {
    provider: value(formData, "provider"),
    model: value(formData, "model")
  });
  finish(result, "模型预设已保存。");
}

export async function enableAiProviderPresetAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setAiProviderPresetEnabled(id, true);
  await auditIfOk(session.user.id, result, "ai_preset.enable", id);
  finish(result, "模型预设已启用。");
}

export async function disableAiProviderPresetAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setAiProviderPresetEnabled(id, false);
  await auditIfOk(session.user.id, result, "ai_preset.disable", id);
  finish(result, "模型预设已停用。");
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/ai" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/ai?${params}` as Route);
}

async function auditIfOk(actorId: string, result: Result, action: string, entityId: string | null, metadata?: Record<string, unknown>) {
  if (!result.ok) {
    return;
  }

  await writeAuditLog({
    actorId,
    action,
    entityType: "AiProviderPreset",
    entityId,
    metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as never) : null
  });
}
