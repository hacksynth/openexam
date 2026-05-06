"use client";

import { useActionState } from "react";
import { FeedbackMessage, SubmitButton, TextField } from "@openexam/core/pixel-ui";

type AuthFormProps = {
  action: (previousState: string | null, formData: FormData) => Promise<string | null>;
  mode: "login" | "register";
  redirectTo?: string;
};

type AdminAuthFormProps = {
  action: (previousState: string | null, formData: FormData) => Promise<string | null>;
  initialError?: string | null;
};

export function AuthForm({ action, mode, redirectTo }: AuthFormProps) {
  const [error, formAction, pending] = useActionState(action, null);
  const isRegister = mode === "register";

  return (
    <form action={formAction} className="pixel-panel grid w-full max-w-md gap-4 p-5">
      <div>
        <p className="text-sm font-bold uppercase text-[var(--muted)]">OpenExam 学习端</p>
        <h1 className="mt-2 text-3xl font-black">{isRegister ? "创建账号" : "登录"}</h1>
      </div>

      <FeedbackMessage error={error ?? undefined} />

      {redirectTo ? <input name="redirectTo" type="hidden" value={redirectTo} /> : null}

      {isRegister ? (
        <TextField autoComplete="name" label="昵称" name="name" type="text" />
      ) : null}

      <TextField autoComplete="email" label="邮箱" name="email" required type="email" />

      <TextField autoComplete={isRegister ? "new-password" : "current-password"} label="密码" minLength={8} name="password" required type="password" />

      <SubmitButton className="px-4 py-2" disabled={pending} label={pending ? "处理中..." : isRegister ? "注册并进入学习端" : "登录学习端"} />
    </form>
  );
}

export function AdminAuthForm({ action, initialError = null }: AdminAuthFormProps) {
  const [error, formAction, pending] = useActionState(action, initialError);

  return (
    <form action={formAction} className="pixel-panel grid w-full max-w-md gap-4 p-5">
      <div>
        <p className="text-sm font-bold uppercase text-[var(--muted)]">OpenExam 管理端</p>
        <h1 className="mt-2 text-3xl font-black">管理员登录</h1>
      </div>

      <FeedbackMessage error={error ?? undefined} />

      <TextField autoComplete="email" label="邮箱" name="email" required type="email" />

      <TextField autoComplete="current-password" label="密码" minLength={8} name="password" required type="password" />

      <SubmitButton className="px-4 py-2" disabled={pending} label={pending ? "处理中..." : "登录管理端"} />
    </form>
  );
}
