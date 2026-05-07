"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { setConsolidationNoteMastered } from "@openexam/core/practice";
import { requireWebSession } from "@/lib/auth";

export async function setConsolidationNoteMasteredAction(formData: FormData) {
  const session = await requireWebSession();
  const returnTo = safeConsolidationReturnTo(String(formData.get("returnTo") ?? ""));
  const result = await setConsolidationNoteMastered(session.user.id, String(formData.get("consolidationNoteId") ?? ""), String(formData.get("mastered") ?? "") === "true");

  revalidatePath("/consolidation" as Route);
  revalidatePath("/dashboard" as Route);
  revalidatePath("/analysis" as Route);
  revalidatePath("/plan" as Route);

  if (!result.ok) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=${encodeURIComponent("待巩固状态已更新。")}` as Route);
}

function safeConsolidationReturnTo(value: string) {
  return value.startsWith("/consolidation") ? value : "/consolidation";
}
