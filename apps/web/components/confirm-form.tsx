"use client";

import { type FormEvent, useCallback, useState } from "react";

export function ConfirmForm({
  action,
  confirmMessage,
  buttonLabel,
  buttonClassName = "pixel-button bg-white px-4 py-2",
  children
}: {
  action: string | ((formData: FormData) => void);
  confirmMessage: string;
  buttonLabel: string;
  buttonClassName?: string;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      if (!pending && !window.confirm(confirmMessage)) {
        e.preventDefault();
        return;
      }
      setPending(true);
    },
    [confirmMessage, pending]
  );

  return (
    <form action={action} onSubmit={handleSubmit}>
      <button className={buttonClassName} disabled={pending} type="submit">
        {pending ? "提交中..." : buttonLabel}
      </button>
      {children}
    </form>
  );
}
