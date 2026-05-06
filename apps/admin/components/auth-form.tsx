"use client";

import { useActionState } from "react";
import { FeedbackMessage, SubmitButton, TextField } from "@openexam/core/pixel-ui";

type AdminAuthFormProps = {
  action: (previousState: string | null, formData: FormData) => Promise<string | null>;
  initialError?: string | null;
};

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
