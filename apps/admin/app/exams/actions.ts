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
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof createExamProgram>>;

type AuditAction = "exam_program.create" | "exam_program.update" | "exam_track.create" | "exam_track.update" | "exam_cycle.create" | "exam_cycle.update" | "exam_subject.create" | "exam_subject.update";

export async function createProgramAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    description: value(formData, "description")
  };
  const result = await createExamProgram(payload);

  await auditIfOk(session.user.id, result, "exam_program.create", null, payload);
  finish(result, "考试项目已创建。");
}

export async function updateProgramAction(formData: FormData) {
  const session = await requireAdminSession();
  const id = value(formData, "id");
  const payload = {
    id,
    ...readProgram(formData)
  };
  const result = await updateExamProgram(payload);

  await auditIfOk(session.user.id, result, "exam_program.update", id, payload);
  finish(result, "考试项目已更新。");
}

export async function createTrackAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    programId: value(formData, "programId"),
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    level: value(formData, "level")
  };
  const result = await createExamTrack(payload);

  await auditIfOk(session.user.id, result, "exam_track.create", null, payload);
  finish(result, "考试方向已创建。");
}

export async function updateTrackAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    id: value(formData, "id"),
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    level: value(formData, "level")
  };
  const result = await updateExamTrack(payload);

  await auditIfOk(session.user.id, result, "exam_track.update", payload.id, payload);
  finish(result, "考试方向已更新。");
}

export async function createCycleAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    trackId: value(formData, "trackId"),
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    startsAt: value(formData, "startsAt"),
    examDate: value(formData, "examDate")
  };
  const result = await createExamCycle(payload);

  await auditIfOk(session.user.id, result, "exam_cycle.create", null, payload);
  finish(result, "考试批次已创建。");
}

export async function updateCycleAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    id: value(formData, "id"),
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    startsAt: value(formData, "startsAt"),
    examDate: value(formData, "examDate")
  };
  const result = await updateExamCycle(payload);

  await auditIfOk(session.user.id, result, "exam_cycle.update", payload.id, payload);
  finish(result, "考试批次已更新。");
}

export async function createSubjectAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    cycleId: value(formData, "cycleId"),
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    description: value(formData, "description")
  };
  const result = await createSubject(payload);

  await auditIfOk(session.user.id, result, "exam_subject.create", null, payload);
  finish(result, "科目已创建。");
}

export async function updateSubjectAction(formData: FormData) {
  const session = await requireAdminSession();
  const payload = {
    id: value(formData, "id"),
    name: value(formData, "name"),
    slug: value(formData, "slug"),
    description: value(formData, "description")
  };
  const result = await updateSubject(payload);

  await auditIfOk(session.user.id, result, "exam_subject.update", payload.id, payload);
  finish(result, "科目已更新。");
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

function entityTypeForAction(action: AuditAction) {
  if (action.startsWith("exam_track")) {
    return "ExamTrack";
  }

  if (action.startsWith("exam_cycle")) {
    return "ExamCycle";
  }

  if (action.startsWith("exam_subject")) {
    return "Subject";
  }

  return "ExamProgram";
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
    entityType: entityTypeForAction(action),
    entityId,
    metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as never) : null
  });
}
