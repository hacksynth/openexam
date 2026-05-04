"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  createSingleChoiceQuestion,
  updateSingleChoiceQuestion,
  type SingleChoiceQuestionInput
} from "@openexam/core/question-admin";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createSingleChoiceQuestion>>;

export async function createSingleChoiceQuestionAction(formData: FormData) {
  await requireAdminSession();
  finish(await createSingleChoiceQuestion(readQuestion(formData)), "题目已创建。");
}

export async function updateSingleChoiceQuestionAction(formData: FormData) {
  await requireAdminSession();
  finish(await updateSingleChoiceQuestion(value(formData, "id"), readQuestion(formData)), "题目已更新。");
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
