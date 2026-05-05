"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { processJob, processNextJob, retryJob } from "@openexam/core/jobs";
import { requireAdminSession } from "@/lib/auth";

type Result = Awaited<ReturnType<typeof processJob>>;

export async function processNextJobAction() {
  await requireAdminSession();
  finish(await processNextJob(), "任务已处理。");
}

export async function processJobAction(formData: FormData) {
  await requireAdminSession();
  finish(await processJob(value(formData, "jobId")), "任务已处理。");
}

export async function retryJobAction(formData: FormData) {
  await requireAdminSession();
  finish(await retryJob(value(formData, "jobId")), "任务已重试。");
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function finish(result: Result, success: string): never {
  revalidatePath("/jobs" as Route);
  revalidatePath("/materials" as Route);
  revalidatePath("/questions" as Route);
  revalidatePath("/wrong-notes" as Route);
  const params = result.ok ? `notice=${encodeURIComponent(success)}` : `error=${encodeURIComponent(result.error)}`;

  redirect(`/jobs?${params}` as Route);
}
