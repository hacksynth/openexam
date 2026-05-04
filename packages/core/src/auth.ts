import { createHash, randomBytes } from "node:crypto";
import type { SessionApp, User, UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { hashPassword, validatePassword, verifyPassword } from "./password";

const sessionTokenBytes = 32;
const defaultSessionDays = 14;

export type AuthApp = "web" | "admin";

export type AuthUser = Pick<User, "id" | "email" | "name" | "role">;

export type AuthSession = {
  id: string;
  app: SessionApp;
  expiresAt: Date;
  user: AuthUser;
};

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function createSessionToken() {
  return randomBytes(sessionTokenBytes).toString("base64url");
}

export function hashSessionToken(token: string) {
  const secret = getSessionSecret();

  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export function getSessionDays() {
  const parsed = Number.parseInt(process.env.SESSION_DAYS ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSessionDays;
}

export async function registerUser(input: { email: string; name?: string | null; password: string }) {
  const email = normalizeEmail(input.email);

  if (!validateEmail(email)) {
    return { ok: false, error: "请输入有效邮箱地址。" } satisfies AuthResult;
  }

  if (!validatePassword(input.password)) {
    return { ok: false, error: "密码至少需要 8 位。" } satisfies AuthResult;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    return { ok: false, error: "该邮箱已注册。" } satisfies AuthResult;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name?.trim() || null,
      passwordHash: await hashPassword(input.password),
      role: "user"
    }
  });

  return { ok: true, user: toAuthUser(user) } satisfies AuthResult;
}

export async function authenticateUser(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return { ok: false, error: "邮箱或密码不正确。" } satisfies AuthResult;
  }

  return { ok: true, user: toAuthUser(user) } satisfies AuthResult;
}

export async function createSession(input: { userId: string; app: AuthApp; days?: number }) {
  const token = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.days ?? getSessionDays()) * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      app: input.app,
      userId: input.userId,
      expiresAt,
      lastSeenAt: now
    }
  });

  return { token, session };
}

export async function getSessionByToken(token: string | undefined, app: AuthApp) {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });

  if (!session || session.app !== app) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return {
    id: session.id,
    app: session.app,
    expiresAt: session.expiresAt,
    user: toAuthUser(session.user)
  } satisfies AuthSession;
}

export async function deleteSessionByToken(token: string | undefined, app: AuthApp) {
  if (!token) {
    return;
  }

  await prisma.session
    .deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
        app
      }
    })
    .catch(() => null);
}

export function userHasRole(user: AuthUser | null | undefined, role: UserRole) {
  return user?.role === role;
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return "openexam-development-session-secret";
}
