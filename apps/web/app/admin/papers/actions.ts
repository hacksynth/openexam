"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createPaper, setPaperArchived, updatePaper, type PaperInput } from "@openexam/core/paper-admin";
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createPaper>>;

export async function createPaperAction(formData: FormData) {
  const session = await requireAdminSession();
  const result = await createPaper(readPaper(formData));
  await auditIfOk(session.user.id, result, "paper.create", null);
  finish(result, "试卷已创建。");
}

export async function updatePaperAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await updatePaper(id, readPaper(formData));
  await auditIfOk(session.user.id, result, "paper.update", id);
  finish(result, "试卷已更新。");
}

export async function archivePaperAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setPaperArchived(id, true);
  await auditIfOk(session.user.id, result, "paper.archive", id);
  finish(result, "试卷已隐藏。");
}

export async function restorePaperAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setPaperArchived(id, false);
  await auditIfOk(session.user.id, result, "paper.restore", id);
  finish(result, "试卷已恢复。");
}

function readPaper(formData: FormData): PaperInput {
  const questionIds = formData.getAll("questionId").map((item) => String(item));

  return {
    title: value(formData, "title"),
    slug: value(formData, "slug"),
    paperType: value(formData, "paperType"),
    visibility: value(formData, "visibility"),
    subjectId: value(formData, "subjectId"),
    questions: questionIds.map((questionId) => ({
      questionId,
      order: value(formData, `order_${questionId}`),
      number: value(formData, `number_${questionId}`),
      section: value(formData, `section_${questionId}`),
      score: value(formData, `score_${questionId}`)
    }))
  };
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/admin/papers" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/admin/papers?${params}` as Route);
}

async function auditIfOk(actorId: string, result: Result, action: string, entityId: string | null) {
  if (!result.ok) {
    return;
  }

  await writeAuditLog({
    actorId,
    action,
    entityType: "Paper",
    entityId
  });
}
