import { cookies } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  createSession,
  deleteSessionByToken,
  getSessionByToken,
  type AuthSession
} from "@openexam/core/auth";

export const webSessionCookieName = "openexam_web_session";

export async function getWebSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(webSessionCookieName)?.value;

  return getSessionByToken(token, "web");
}

export async function requireWebSession() {
  const session = await getWebSession();

  if (!session) {
    redirect("/login" as Route);
  }

  return session;
}

export async function redirectAuthenticatedWebUser() {
  const session = await getWebSession();

  if (session) {
    redirect("/dashboard" as Route);
  }
}

export async function setWebSessionCookie(userId: string) {
  const { token, session } = await createSession({ userId, app: "web" });
  const cookieStore = await cookies();

  cookieStore.set(webSessionCookieName, token, sessionCookieOptions(session.expiresAt));
}

export async function clearWebSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(webSessionCookieName)?.value;

  await deleteSessionByToken(token, "web");
  cookieStore.delete(webSessionCookieName);
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
