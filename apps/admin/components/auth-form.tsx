"use client";

import { useActionState } from "react";

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

      {error ? <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

      <label className="grid gap-2 text-sm font-bold">
        邮箱
        <input className="border-3 border-black bg-white px-3 py-2" name="email" type="email" autoComplete="email" required />
      </label>

      <label className="grid gap-2 text-sm font-bold">
        密码
        <input
          className="border-3 border-black bg-white px-3 py-2"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </label>

      <button className="pixel-button px-4 py-2" disabled={pending} type="submit">
        {pending ? "处理中..." : "登录管理端"}
      </button>
    </form>
  );
}
