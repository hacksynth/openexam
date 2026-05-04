"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { setWrongNoteMastered } from "@openexam/core/practice";
import { requireWebSession } from "@/lib/auth";

export async function setWrongNoteMasteredAction(formData: FormData) {
  const session = await requireWebSession();
  const result = await setWrongNoteMastered(session.user.id, String(formData.get("wrongNoteId") ?? ""), String(formData.get("mastered") ?? "") === "true");

  revalidatePath("/wrong-notes" as Route);
  revalidatePath("/dashboard" as Route);

  if (!result.ok) {
    redirect(`/wrong-notes?error=${encodeURIComponent(result.error)}` as Route);
  }

  redirect("/wrong-notes?notice=%E9%94%99%E9%A2%98%E7%8A%B6%E6%80%81%E5%B7%B2%E6%9B%B4%E6%96%B0%E3%80%82" as Route);
}
