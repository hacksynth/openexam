"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { authenticateUser, userHasRole } from "@openexam/core/auth";
import { setAdminSessionCookie } from "@/lib/auth";

export async function adminLoginAction(_previousState: string | null, formData: FormData) {
  const result = await authenticateUser({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? "")
  });

  if (!result.ok) {
    return result.error;
  }

  if (!userHasRole(result.user, "admin")) {
    return "该账号没有管理端权限。";
  }

  await setAdminSessionCookie(result.user.id);
  redirect("/admin" as Route);
}
