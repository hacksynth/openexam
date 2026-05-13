"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { registerUser } from "@openexam/core/auth";
import { normalizeWebRedirectPath, setWebSessionCookie } from "@/lib/auth";
import { withDefaultLocalePath } from "@/lib/locale";

export async function registerAction(_previousState: string | null, formData: FormData) {
  const result = await registerUser({
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    password: String(formData.get("password") ?? "")
  });

  if (!result.ok) {
    return result.error;
  }

  await setWebSessionCookie(result.user.id);
  redirect(withDefaultLocalePath(normalizeWebRedirectPath(String(formData.get("redirectTo") ?? ""))) as Route);
}
