"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  createSingleChoiceQuestion,
  importSingleChoiceQuestions,
  setSingleChoiceQuestionArchived,
  updateSingleChoiceQuestionReviewStatus,
  updateSingleChoiceQuestion,
  type SingleChoiceQuestionInput
} from "@openexam/core/question-admin";
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createSingleChoiceQuestion>> | Awaited<ReturnType<typeof importSingleChoiceQuestions>>;

export async function createSingleChoiceQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const result = await createSingleChoiceQuestion(readQuestion(formData));
  await auditIfOk(session.user.id, result, "question.create", null);
  finish(result, "题目已创建。");
}

export async function updateSingleChoiceQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await updateSingleChoiceQuestion(id, readQuestion(formData));
  await auditIfOk(session.user.id, result, "question.update", id);
  finish(result, "题目已更新。");
}

export async function importSingleChoiceQuestionsAction(formData: FormData) {
  const session = await requireAdminSession();
  const result = await importSingleChoiceQuestions({
    jsonPayload: value(formData, "jsonPayload")
  });

  await auditIfOk(session.user.id, result, "question.import", null, result.ok ? { count: result.data.count } : undefined);
  finish(result, result.ok ? `已导入 ${result.data.count} 道题。` : "题目导入失败。");
}

export async function updateSingleChoiceQuestionReviewStatusAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const reviewStatus = value(formData, "reviewStatus");
  const result = await updateSingleChoiceQuestionReviewStatus(id, reviewStatus);
  await auditIfOk(session.user.id, result, "question.review_status", id, { reviewStatus });
  finish(result, "审核状态已更新。");
}

export async function archiveSingleChoiceQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setSingleChoiceQuestionArchived(id, true);
  await auditIfOk(session.user.id, result, "question.archive", id);
  finish(result, "题目已归档。");
}

export async function restoreSingleChoiceQuestionAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const result = await setSingleChoiceQuestionArchived(id, false);
  await auditIfOk(session.user.id, result, "question.restore", id);
  finish(result, "题目已恢复。");
}

function readQuestion(formData: FormData): SingleChoiceQuestionInput {
  return {
    stem: value(formData, "stem"),
    optionA: value(formData, "optionA"),
    optionB: value(formData, "optionB"),
    optionC: value(formData, "optionC"),
    optionD: value(formData, "optionD"),
    answer: value(formData, "answer"),
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
  revalidatePath("/questions" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/questions?${params}` as Route);
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
