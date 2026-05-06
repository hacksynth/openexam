"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { clearAdminSessionCookie } from "@/lib/auth";

export async function adminLogoutAction() {
  await clearAdminSessionCookie();
  redirect("/admin/login" as Route);
}
