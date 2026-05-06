"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  createAdminQuestion,
  importAdminQuestions,
  importAdminQuestionsFromCsv,
  setAdminQuestionArchived,
  updateAdminQuestionReviewStatus,
  updateAdminQuestion,
  type AdminQuestionInput
} from "@openexam/core/question-admin";
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createAdminQuestion>> | Awaited<ReturnType<typeof importAdminQuestions>> | Awaited<ReturnType<typeof importAdminQuestionsFromCsv>>;

export async function createAdminQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const result = await createAdminQuestion(readQuestion(formData));
  await auditIfOk(session.user.id, result, "question.create", null);
  finish(result, "题目已创建。");
}

export async function updateAdminQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await updateAdminQuestion(id, readQuestion(formData));
  await auditIfOk(session.user.id, result, "question.update", id);
  finish(result, "题目已更新。");
}

export async function importAdminQuestionsAction(formData: FormData) {
  const session = await requireAdminSession();
  const result = await importAdminQuestions({
    jsonPayload: value(formData, "jsonPayload")
  });

  await auditIfOk(session.user.id, result, "question.import", null, result.ok ? { count: result.data.count } : undefined);
  finish(result, result.ok ? `已导入 ${result.data.count} 道题。` : "题目导入失败。");
}

export async function importAdminQuestionsFromCsvFileAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    redirect(`/admin/questions?error=${encodeURIComponent("请选择要上传的 CSV 文件。")}` as Route);
  }

  const csvText = await file.text();
  const result = await importAdminQuestionsFromCsv({ csvText });

  await auditIfOk(session.user.id, result, "question.import_csv", null, result.ok ? { count: result.data.count } : undefined);
  finish(result, result.ok ? `已从 CSV 导入 ${result.data.count} 道题。` : "CSV 导入失败。");
}

export async function updateAdminQuestionReviewStatusAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const reviewStatus = value(formData, "reviewStatus");
  const result = await updateAdminQuestionReviewStatus(id, reviewStatus);
  await auditIfOk(session.user.id, result, "question.review_status", id, { reviewStatus });
  finish(result, "审核状态已更新。");
}

export async function archiveAdminQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setAdminQuestionArchived(id, true);
  await auditIfOk(session.user.id, result, "question.archive", id);
  finish(result, "题目已归档。");
}

export async function restoreAdminQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setAdminQuestionArchived(id, false);
  await auditIfOk(session.user.id, result, "question.restore", id);
  finish(result, "题目已恢复。");
}

function readQuestion(formData: FormData): AdminQuestionInput {
  return {
    kind: value(formData, "kind"),
    stem: value(formData, "stem"),
    optionA: value(formData, "optionA"),
    optionB: value(formData, "optionB"),
    optionC: value(formData, "optionC"),
    optionD: value(formData, "optionD"),
    answer: value(formData, "answerText") || value(formData, "answer"),
    caseMaterial: value(formData, "caseMaterial"),
    payloadJson: value(formData, "payloadJson"),
    answerKeyJson: value(formData, "answerKeyJson"),
    rubricJson: value(formData, "rubricJson"),
    explanation: value(formData, "explanation"),
    difficulty: value(formData, "difficulty"),
    knowledgeNodeId: value(formData, "knowledgeNodeId"),
    visibility: value(formData, "visibility"),
    sourceType: value(formData, "sourceType"),
    sourceTitle: value(formData, "sourceTitle"),
    sourceUrl: value(formData, "sourceUrl"),
    sourceLicense: value(formData, "sourceLicense"),
    reviewStatus: value(formData, "reviewStatus")
  };
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/admin/questions" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/admin/questions?${params}` as Route);
}

async function auditIfOk(actorId: string, result: Result, action: string, entityId: string | null, metadata?: Record<string, unknown>) {
  if (!result.ok) {
    return;
  }

  await writeAuditLog({
    actorId,
    action,
    entityType: "Question",
    entityId,
    metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as never) : null
  });
}
