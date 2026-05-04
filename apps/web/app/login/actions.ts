"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { authenticateUser } from "@openexam/core/auth";
import { setWebSessionCookie } from "@/lib/auth";

export async function loginAction(_previousState: string | null, formData: FormData) {
  const result = await authenticateUser({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? "")
  });

  if (!result.ok) {
    return result.error;
  }

  await setWebSessionCookie(result.user.id);
  redirect("/dashboard" as Route);
}
