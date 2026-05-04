"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  createExamCycle,
  createExamProgram,
  createExamTrack,
  createSubject,
  updateExamCycle,
  updateExamProgram,
  updateExamTrack,
  updateSubject
} from "@openexam/core/exam-core";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createExamProgram>>;

export async function createProgramAction(formData: FormData) {
  await requireAdminSession();
  finish(await createExamProgram(readProgram(formData)), "考试项目已创建。");
}

export async function updateProgramAction(formData: FormData) {
  await requireAdminSession();
  finish(await updateExamProgram({ id: value(formData, "id"), ...readProgram(formData) }), "考试项目已更新。");
}

export async function createTrackAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await createExamTrack({
      programId: value(formData, "programId"),
      name: value(formData, "name"),
      slug: value(formData, "slug"),
      level: value(formData, "level")
    }),
    "考试方向已创建。"
  );
}

export async function updateTrackAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await updateExamTrack({
      id: value(formData, "id"),
      name: value(formData, "name"),
      slug: value(formData, "slug"),
      level: value(formData, "level")
    }),
    "考试方向已更新。"
  );
}

export async function createCycleAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await createExamCycle({
      trackId: value(formData, "trackId"),
      name: value(formData, "name"),
      slug: value(formData, "slug"),
      startsAt: value(formData, "startsAt"),
      examDate: value(formData, "examDate")
    }),
    "考试批次已创建。"
  );
}

export async function updateCycleAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await updateExamCycle({
      id: value(formData, "id"),
      name: value(formData, "name"),
      slug: value(formData, "slug"),
      startsAt: value(formData, "startsAt"),
      examDate: value(formData, "examDate")
    }),
    "考试批次已更新。"
  );
}

export async function createSubjectAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await createSubject({
      cycleId: value(formData, "cycleId"),
      name: value(formData, "name"),
      slug: value(formData, "slug"),
      description: value(formData, "description")
    }),
    "科目已创建。"
  );
}

export async function updateSubjectAction(formData: FormData) {
  await requireAdminSession();
  finish(
    await updateSubject({
      id: value(formData, "id"),
      name: value(formData, "name"),
      slug: value(formData, "slug"),
      description: value(formData, "description")
    }),
    "科目已更新。"
  );
}

function readProgram(formData: FormData) {
  return {
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    description: value(formData, "description")
  };
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/exams" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/exams?${params}` as Route);
}
