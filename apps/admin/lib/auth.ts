import { cookies } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  createSession,
  deleteSessionByToken,
  getSessionByToken,
  userHasRole,
  type AuthSession
} from "@openexam/core/auth";

export const adminSessionCookieName = "openexam_admin_session";

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  return getSessionByToken(token, "admin");
}

export async function requireAdminSession() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/login" as Route);
  }

  if (!userHasRole(session.user, "admin")) {
    redirect("/login?error=forbidden" as Route);
  }

  return session;
}

export async function redirectAuthenticatedAdminUser() {
  const session = await getAdminSession();

  if (session && userHasRole(session.user, "admin")) {
    redirect("/" as Route);
  }
}

export async function setAdminSessionCookie(userId: string) {
  const { token, session } = await createSession({ userId, app: "admin" });
  const cookieStore = await cookies();

  cookieStore.set(adminSessionCookieName, token, sessionCookieOptions(session.expiresAt));
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  await deleteSessionByToken(token, "admin");
  cookieStore.delete(adminSessionCookieName);
}

function sessionCookieOptions(expiresAt: AuthSession["expiresAt"]) {
  return {
    expires: expiresAt,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/"
  };
}
