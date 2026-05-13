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
import { withDefaultLocalePath } from "./locale";

export const webSessionCookieName = "openexam_web_session";
export const adminSessionCookieName = "openexam_admin_session";

export async function getWebSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(webSessionCookieName)?.value;

  return getSessionByToken(token, "web");
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  return getSessionByToken(token, "admin");
}

export async function requireWebSession() {
  const session = await getWebSession();

  if (!session) {
    redirect(withDefaultLocalePath("/login") as Route);
  }

  return session;
}

export async function requireAdminSession() {
  const session = await getAdminSession();

  if (!session) {
    redirect(withDefaultLocalePath("/admin/login") as Route);
  }

  if (!userHasRole(session.user, "admin")) {
    redirect(withDefaultLocalePath("/admin/login?error=forbidden") as Route);
  }

  return session;
}

export async function redirectAuthenticatedWebUser() {
  const session = await getWebSession();

  if (session) {
    redirect(withDefaultLocalePath("/dashboard") as Route);
  }
}

export async function redirectAuthenticatedAdminUser() {
  const session = await getAdminSession();

  if (session && userHasRole(session.user, "admin")) {
    redirect(withDefaultLocalePath("/admin") as Route);
  }
}

export async function redirectAuthenticatedWebUserTo(redirectTo?: string | null) {
  const session = await getWebSession();

  if (session) {
    redirect(withDefaultLocalePath(normalizeWebRedirectPath(redirectTo)) as Route);
  }
}

export function normalizeWebRedirectPath(value?: string | null, fallback = "/dashboard") {
  const text = String(value ?? "").trim();

  if (!text || !text.startsWith("/") || text.startsWith("//") || text.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(text, "http://openexam.local");

    if (parsed.origin !== "http://openexam.local" || parsed.pathname === "/login" || parsed.pathname === "/register") {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function setWebSessionCookie(userId: string) {
  const { token, session } = await createSession({ userId, app: "web" });
  const cookieStore = await cookies();

  cookieStore.set(webSessionCookieName, token, sessionCookieOptions(session.expiresAt));
}

export async function setAdminSessionCookie(userId: string) {
  const { token, session } = await createSession({ userId, app: "admin" });
  const cookieStore = await cookies();

  cookieStore.set(adminSessionCookieName, token, sessionCookieOptions(session.expiresAt));
}

export async function clearWebSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(webSessionCookieName)?.value;

  await deleteSessionByToken(token, "web");
  cookieStore.delete(webSessionCookieName);
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
    secure: shouldUseSecureSessionCookie(),
    path: "/"
  };
}

function shouldUseSecureSessionCookie() {
  const configured = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();

  if (configured) {
    return ["1", "true", "yes", "on"].includes(configured);
  }

  return [process.env.AUTH_URL, process.env.NEXT_PUBLIC_WEB_URL, process.env.NEXT_PUBLIC_ADMIN_URL].some((value) => value?.trim().startsWith("https://"));
}
