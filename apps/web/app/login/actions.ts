"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { authenticateUser } from "@openexam/core/auth";
import { normalizeWebRedirectPath, setWebSessionCookie } from "@/lib/auth";
import { withDefaultLocalePath } from "@/lib/locale";

export async function loginAction(_previousState: string | null, formData: FormData) {
  const result = await authenticateUser({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? "")
  });

  if (!result.ok) {
    return result.error;
  }

  await setWebSessionCookie(result.user.id);
  redirect(withDefaultLocalePath(normalizeWebRedirectPath(String(formData.get("redirectTo") ?? ""))) as Route);
}
