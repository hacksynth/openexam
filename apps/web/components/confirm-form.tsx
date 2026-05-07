"use client";

import { ConfirmFormDialog } from "./confirm-dialog";

export function ConfirmForm({
  action,
  confirmMessage,
  confirmTitle = "确认操作",
  confirmLabel = "确认",
  tone = "default",
  buttonLabel,
  buttonClassName = "pixel-button bg-white px-4 py-2",
  children
}: {
  action: string | ((formData: FormData) => void);
  confirmMessage: string;
  confirmTitle?: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  buttonLabel: string;
  buttonClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <ConfirmFormDialog
      action={action}
      buttonClassName={buttonClassName}
      buttonLabel={buttonLabel}
      confirmLabel={confirmLabel}
      description={confirmMessage}
      title={confirmTitle}
      tone={tone}
    >
      {children}
    </ConfirmFormDialog>
  );
}
