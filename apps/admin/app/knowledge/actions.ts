"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  createKnowledgeNode,
  createSyllabus,
  updateKnowledgeNode,
  updateSyllabus
} from "@openexam/core/exam-core";
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createSyllabus>>;

type AuditAction = "syllabus.create" | "syllabus.update" | "knowledge_node.create" | "knowledge_node.update";

export async function createSyllabusAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    subjectId: value(formData, "subjectId"),
    name: value(formData, "name"),
    version: value(formData, "version")
  };
  const result = await createSyllabus(payload);

  await auditIfOk(session.user.id, result, "syllabus.create", null, payload);
  finish(result, "大纲已创建。");
}

export async function updateSyllabusAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    id: value(formData, "id"),
    name: value(formData, "name"),
    version: value(formData, "version")
  };
  const result = await updateSyllabus(payload);

  await auditIfOk(session.user.id, result, "syllabus.update", payload.id, payload);
  finish(result, "大纲已更新。");
}

export async function createKnowledgeNodeAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    syllabusId: value(formData, "syllabusId"),
    parentId: value(formData, "parentId"),
    code: value(formData, "code"),
    title: value(formData, "title"),
    description: value(formData, "description"),
    examExpectation: value(formData, "examExpectation")
  };
  const result = await createKnowledgeNode(payload);

  await auditIfOk(session.user.id, result, "knowledge_node.create", null, payload);
  finish(result, "知识点已创建。");
}

export async function updateKnowledgeNodeAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    id: value(formData, "id"),
    parentId: value(formData, "parentId"),
    code: value(formData, "code"),
    title: value(formData, "title"),
    description: value(formData, "description"),
    examExpectation: value(formData, "examExpectation")
  };
  const result = await updateKnowledgeNode(payload);

  await auditIfOk(session.user.id, result, "knowledge_node.update", payload.id, payload);
  finish(result, "知识点已更新。");
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/knowledge" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/knowledge?${params}` as Route);
}

async function auditIfOk(
  actorId: string,
  result: Result,
  action: AuditAction,
  entityId: string | null,
  metadata?: Record<string, unknown>
) {
  if (!result.ok) {
    return;
  }

  await writeAuditLog({
    actorId,
    action,
    entityType: action.startsWith("knowledge_node") ? "KnowledgeNode" : "Syllabus",
    entityId,
    metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as never) : null
  });
}
