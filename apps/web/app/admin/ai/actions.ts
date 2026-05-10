"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { listAiProviderModels, saveAdminAiCredential, setAiProviderPresetEnabled, testAiProviderCredential, upsertAiProviderPreset } from "@openexam/core/ai";
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof upsertAiProviderPreset>>;
type ActionResult = { ok: true } | { ok: false; error: string };

export type AiCredentialActionState = {
  error?: string;
  models?: { id: string; label: string }[];
  notice?: string;
};

export async function saveAdminAiCredentialAction(formData: FormData) {
  const session = await requireAdminSession();
  const provider = value(formData, "provider");
  const result = await saveAdminAiCredential({
    provider,
    apiKey: value(formData, "apiKey"),
    baseUrl: value(formData, "baseUrl"),
    apiMode: value(formData, "apiMode"),
    defaultModel: value(formData, "defaultModel"),
    updatedById: session.user.id
  });

  await auditIfOk(session.user.id, result, "ai_credential.upsert", provider || null, {
    provider,
    baseUrl: value(formData, "baseUrl"),
    apiMode: value(formData, "apiMode"),
    defaultModel: value(formData, "defaultModel")
  });
  finish(result, "平台 AI 凭据已保存。");
}

export async function listAdminAiCredentialModelsAction(_previousState: AiCredentialActionState, formData: FormData): Promise<AiCredentialActionState> {
  await requireAdminSession();
  const provider = value(formData, "provider");
  const result = await listAiProviderModels({
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
    notice: result.data.models.length > 0 ? `已获取 ${result.data.models.length} 个模型。` : "未返回模型。"
  };
}

export async function testAdminAiCredentialAction(_previousState: AiCredentialActionState, formData: FormData): Promise<AiCredentialActionState> {
  await requireAdminSession();
  const provider = value(formData, "provider");
  const result = await testAiProviderCredential({
    provider,
    apiKey: value(formData, "apiKey"),
    baseUrl: value(formData, "baseUrl"),
    apiMode: value(formData, "apiMode"),
    defaultModel: value(formData, "defaultModel"),
    testModel: value(formData, "defaultModel")
  });

  return result.ok ? { notice: "平台 AI 凭据连接测试通过。" } : { error: result.error };
}

export async function upsertAiProviderPresetAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await upsertAiProviderPreset({
      id: value(formData, "id"),
      provider: value(formData, "provider"),
      model: value(formData, "model"),
      label: value(formData, "label"),
      capabilities: formData.getAll("capabilities").map((item) => String(item)),
      defaultForTasks: formData.getAll("defaultForTasks").map((item) => String(item)),
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

function finish(result: Result | ActionResult, success: string): never {
  revalidatePath("/admin/ai" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/admin/ai?${params}` as Route);
}

async function auditIfOk(actorId: string, result: Result | ActionResult, action: string, entityId: string | null, metadata?: Record<string, unknown>) {
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
