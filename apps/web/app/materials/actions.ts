"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { uploadMaterial } from "@openexam/core/materials";
import { requireWebSession } from "@/lib/auth";

export async function uploadMaterialAction(formData: FormData) {
  const session = await requireWebSession();
  const file = formData.get("file");

  if (!isUploadFile(file)) {
    redirect(`/materials?error=${encodeURIComponent("请选择要上传的资料文件。")}` as Route);
  }

  const result = await uploadMaterial(session.user.id, {
    title: value(formData, "title"),
    subjectId: value(formData, "subjectId"),
    sourceLicense: value(formData, "sourceLicense"),
    file
  });

  revalidatePath("/materials" as Route);

  if (!result.ok) {
    redirect(`/materials?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`/materials?notice=${encodeURIComponent("资料已上传，抽题任务已进入队列。")}` as Route);
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}
