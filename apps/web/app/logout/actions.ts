"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { clearWebSessionCookie } from "@/lib/auth";

export async function logoutAction() {
  await clearWebSessionCookie();
  redirect("/login" as Route);
}
