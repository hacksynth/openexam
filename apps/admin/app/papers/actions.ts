"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createPaper, setPaperArchived, updatePaper, type PaperInput } from "@openexam/core/paper-admin";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createPaper>>;

export async function createPaperAction(formData: FormData) {
  await requireAdminSession();
  finish(await createPaper(readPaper(formData)), "试卷已创建。");
}

export async function updatePaperAction(formData: FormData) {
  await requireAdminSession();
  finish(await updatePaper(value(formData, "id"), readPaper(formData)), "试卷已更新。");
}

export async function archivePaperAction(formData: FormData) {
  await requireAdminSession();
  finish(await setPaperArchived(value(formData, "id"), true), "试卷已隐藏。");
}

export async function restorePaperAction(formData: FormData) {
  await requireAdminSession();
  finish(await setPaperArchived(value(formData, "id"), false), "试卷已恢复公开。");
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
  revalidatePath("/papers" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/papers?${params}` as Route);
}
