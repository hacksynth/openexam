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
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createSyllabus>>;

export async function createSyllabusAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await createSyllabus({
      subjectId: value(formData, "subjectId"),
      name: value(formData, "name"),
      version: value(formData, "version")
    }),
    "大纲已创建。"
  );
}

export async function updateSyllabusAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await updateSyllabus({
      id: value(formData, "id"),
      name: value(formData, "name"),
      version: value(formData, "version")
    }),
    "大纲已更新。"
  );
}

export async function createKnowledgeNodeAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await createKnowledgeNode({
      syllabusId: value(formData, "syllabusId"),
      parentId: value(formData, "parentId"),
      code: value(formData, "code"),
      title: value(formData, "title"),
      description: value(formData, "description"),
      examExpectation: value(formData, "examExpectation")
    }),
    "知识点已创建。"
  );
}

export async function updateKnowledgeNodeAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await updateKnowledgeNode({
      id: value(formData, "id"),
      parentId: value(formData, "parentId"),
      code: value(formData, "code"),
      title: value(formData, "title"),
      description: value(formData, "description"),
      examExpectation: value(formData, "examExpectation")
    }),
    "知识点已更新。"
  );
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/knowledge" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/knowledge?${params}` as Route);
}
