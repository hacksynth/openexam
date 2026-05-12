"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { confirmMaterialQuestionCandidate, confirmMaterialQuestionCandidates, updateMaterialQuestionCandidate, uploadMaterial } from "@openexam/core/materials";
import { writeAuditLog } from "@openexam/core/audit";
import { requireAdminSession } from "@/lib/auth";

export async function uploadAdminMaterialAction(formData: FormData) {
  const session = await requireAdminSession();
  const file = formData.get("file");

  if (!isUploadFile(file)) {
    redirect(`/admin/materials?error=${encodeURIComponent("请选择要上传的资料文件。")}` as Route);
  }

  const result = await uploadMaterial(session.user.id, {
    title: value(formData, "title"),
    subjectId: value(formData, "subjectId"),
    sourceLicense: value(formData, "sourceLicense"),
    libraryScope: "platform",
    file
  });

  revalidatePath("/admin/materials" as Route);
  revalidatePath("/admin/jobs" as Route);

  if (!result.ok) {
    redirect(`/admin/materials?error=${encodeURIComponent(result.error)}` as Route);
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "material.upload",
    entityType: "Material",
    entityId: result.data.materialId,
    metadata: { jobId: result.data.jobId }
  });

  redirect(`/admin/materials?notice=${encodeURIComponent("资料已上传，抽题任务已进入队列。")}` as Route);
}

export async function confirmCandidateAction(formData: FormData) {
  const session = await requireAdminSession();
  const result = await confirmMaterialQuestionCandidate(value(formData, "candidateId"));

  revalidatePath("/admin/materials" as Route);
  revalidatePath("/admin/questions" as Route);

  if (!result.ok) {
    redirect(materialsRedirectUrl(formData, "error", result.error));
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "material_candidate.confirm",
    entityType: "MaterialQuestionCandidate",
    entityId: value(formData, "candidateId"),
    metadata: { questionId: result.data.questionId }
  });

  redirect(materialsRedirectUrl(formData, "notice", "候选题已确认并加入题库。"));
}

export async function confirmSelectedCandidatesAction(formData: FormData) {
  const session = await requireAdminSession();
  const candidateIds = formData.getAll("candidateIds").map((item) => String(item));
  const result = await confirmMaterialQuestionCandidates(candidateIds);

  revalidatePath("/admin/materials" as Route);
  revalidatePath("/admin/questions" as Route);

  if (!result.ok) {
    redirect(materialsRedirectUrl(formData, "error", result.error));
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "material_candidate.bulk_confirm",
    entityType: "MaterialQuestionCandidate",
    entityId: "bulk",
    metadata: { candidateIds, questionIds: result.data.questionIds }
  });

  redirect(materialsRedirectUrl(formData, "notice", `已将 ${result.data.count} 道候选题加入题库。`));
}

export async function updateCandidateAction(formData: FormData) {
  const session = await requireAdminSession();
  const candidateId = value(formData, "candidateId");
  const result = await updateMaterialQuestionCandidate(candidateId, {
    kind: value(formData, "kind"),
    stem: value(formData, "stem"),
    optionA: value(formData, "optionA"),
    optionB: value(formData, "optionB"),
    optionC: value(formData, "optionC"),
    optionD: value(formData, "optionD"),
    answer: value(formData, "answer"),
    payloadJson: value(formData, "payloadJson"),
    answerKeyJson: value(formData, "answerKeyJson"),
    explanation: value(formData, "explanation"),
    difficulty: value(formData, "difficulty"),
    knowledgeNodeId: value(formData, "knowledgeNodeId"),
    sourceRef: value(formData, "sourceRef")
  });

  revalidatePath("/admin/materials" as Route);

  if (!result.ok) {
    redirect(materialsRedirectUrl(formData, "error", result.error));
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "material_candidate.update",
    entityType: "MaterialQuestionCandidate",
    entityId: candidateId
  });

  redirect(materialsRedirectUrl(formData, "notice", "候选题已更新。"));
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function materialsRedirectUrl(formData: FormData, feedbackKey: "error" | "notice", feedbackValue: string): Route {
  const params = new URLSearchParams();

  for (const key of ["pendingPage", "confirmedPage", "candidatePageSize"]) {
    const current = value(formData, key);

    if (current) {
      params.set(key, current);
    }
  }

  params.set(feedbackKey, feedbackValue);

  return `/admin/materials?${params.toString()}` as Route;
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}
