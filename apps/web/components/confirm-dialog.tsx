"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

type ConfirmTone = "default" | "danger";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  tone?: ConfirmTone;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  pending = false,
  pendingLabel = "提交中...",
  tone = "default",
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    return () => {
      previousActiveElement?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open, pending]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={pending ? undefined : onCancel}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="pixel-panel w-full max-w-lg bg-white p-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="border-b-3 border-black pb-3">
          <p className="text-xs font-bold uppercase text-[var(--muted)]">确认</p>
          <h2 className="mt-1 text-2xl font-black" id={titleId}>
            {title}
          </h2>
        </div>
        <p className="mt-4 border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold leading-7 text-[var(--muted)]" id={descriptionId}>
          {description}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button className="pixel-button bg-white px-4 py-2" disabled={pending} onClick={onCancel} ref={cancelButtonRef} type="button">
            {cancelLabel}
          </button>
          <button className={`pixel-button px-4 py-2 ${tone === "danger" ? "bg-[var(--danger)] text-white" : ""}`} disabled={pending} onClick={onConfirm} type="button">
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    tone?: ConfirmTone;
    onConfirm: () => void;
  } | null>(null);

  const confirm = useCallback((nextRequest: NonNullable<typeof request>) => {
    setRequest(nextRequest);
  }, []);

  const dialog = request ? (
    <ConfirmDialog
      confirmLabel={request.confirmLabel}
      description={request.description}
      onCancel={() => setRequest(null)}
      onConfirm={() => {
        const onConfirm = request.onConfirm;
        setRequest(null);
        onConfirm();
      }}
      open
      title={request.title}
      tone={request.tone}
    />
  ) : null;

  return { confirm, dialog };
}

export function ConfirmFormDialog({
  action,
  title,
  description,
  confirmLabel,
  buttonLabel,
  buttonClassName = "pixel-button bg-white px-4 py-2",
  tone = "default",
  pendingLabel = "提交中...",
  children
}: {
  action: string | ((formData: FormData) => void);
  title: string;
  description: string;
  confirmLabel: string;
  buttonLabel: string;
  buttonClassName?: string;
  tone?: ConfirmTone;
  pendingLabel?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (confirmedRef.current) {
        confirmedRef.current = false;
        return;
      }

      if (!pending) {
        event.preventDefault();
        setOpen(true);
      }
    },
    [pending]
  );

  const handleConfirm = useCallback(() => {
    confirmedRef.current = true;
    setPending(true);
    setOpen(false);
    formRef.current?.requestSubmit();
  }, []);

  return (
    <>
      <form action={action} onSubmit={handleSubmit} ref={formRef}>
        <button className={buttonClassName} disabled={pending} type="submit">
          {pending ? pendingLabel : buttonLabel}
        </button>
        {children}
      </form>
      <ConfirmDialog
        confirmLabel={confirmLabel}
        description={description}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
        open={open}
        pending={pending}
        pendingLabel={pendingLabel}
        title={title}
        tone={tone}
      />
    </>
  );
}
