import * as React from "react";
import { PixelDatePicker } from "./pixel-date-picker";
import { PixelSelect } from "./pixel-select";

export const pixelInputClass = "min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold";
export const pixelFieldClass = "grid gap-2 text-sm font-bold";

type Tone = "default" | "notice" | "danger" | "success" | "warning";

type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "children"> & {
  inputClassName?: string;
  label: string;
  labelClassName?: string;
};

type TextareaFieldProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  labelClassName?: string;
  textareaClassName?: string;
};

type SelectFieldProps = {
  children: React.ReactNode;
  defaultValue?: string;
  label: string;
  labelClassName?: string;
  name: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  selectClassName?: string;
};

type DateFieldProps = {
  defaultValue?: string;
  label: string;
  labelClassName?: string;
  name: string;
  required?: boolean;
};

type FeedbackMessageProps = {
  error?: string;
  notice?: string;
};

type PixelChoiceProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  children: React.ReactNode;
  inputClassName?: string;
  type: "checkbox" | "radio";
};

export type PixelButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "success";
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const PixelButton = React.forwardRef<HTMLButtonElement, PixelButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    const variantClass =
      variant === "danger"
        ? "bg-[var(--danger)] text-white"
        : variant === "success"
          ? "bg-[var(--teal)] text-white"
          : variant === "secondary"
            ? "bg-white"
            : "bg-[var(--primary)]";

    return <button ref={ref} className={cn("pixel-button px-4 py-2", variantClass, className)} {...props} />;
  }
);

PixelButton.displayName = "PixelButton";

export function SubmitButton({
  className,
  label,
  variant,
  ...props
}: Omit<PixelButtonProps, "children"> & {
  label: string;
}) {
  return (
    <PixelButton className={cn("self-end text-sm", className)} type="submit" variant={variant} {...props}>
      {label}
    </PixelButton>
  );
}

export function PixelPanel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("pixel-panel", className)} {...props} />;
}

export function StatusChip({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-[var(--danger)] text-white"
      : tone === "success"
        ? "bg-[var(--teal)]"
        : tone === "warning"
          ? "bg-[var(--primary)]"
          : tone === "notice"
            ? "bg-[var(--ai-soft)]"
            : "";

  return <span className={cn("status-chip px-2 py-1", toneClass, className)} {...props} />;
}

export function FeedbackMessage({ error, notice }: FeedbackMessageProps) {
  if (!error && !notice) {
    return null;
  }

  return (
    <p className={cn("border-3 border-black p-3 text-sm font-bold", error ? "bg-red-50 text-red-700" : "bg-[var(--primary)] text-black")}>
      {error || notice}
    </p>
  );
}

export function TextField({ className, inputClassName, label, labelClassName, ...props }: TextFieldProps) {
  return (
    <label className={cn(pixelFieldClass, labelClassName)}>
      {label}
      <input className={cn(pixelInputClass, inputClassName, className)} {...props} />
    </label>
  );
}

export function TextareaField({ className, label, labelClassName, textareaClassName, ...props }: TextareaFieldProps) {
  return (
    <label className={cn(pixelFieldClass, labelClassName)}>
      {label}
      <textarea className={cn(pixelInputClass, "leading-7", textareaClassName, className)} {...props} />
    </label>
  );
}

export function SelectField({
  children,
  defaultValue,
  label,
  labelClassName,
  name,
  onValueChange,
  required = false,
  selectClassName
}: SelectFieldProps) {
  return (
    <label className={cn(pixelFieldClass, labelClassName)}>
      {label}
      <PixelSelect className={cn(pixelInputClass, selectClassName)} defaultValue={defaultValue} name={name} onValueChange={onValueChange} required={required}>
        {children}
      </PixelSelect>
    </label>
  );
}

export function DateField({ defaultValue = "", label, labelClassName, name, required = false }: DateFieldProps) {
  return (
    <label className={cn(pixelFieldClass, labelClassName)}>
      {label}
      <PixelDatePicker ariaLabel={label} className={pixelInputClass} defaultValue={defaultValue} name={name} required={required} />
    </label>
  );
}

export function PixelChoice({ children, className, inputClassName, type, ...props }: PixelChoiceProps) {
  return (
    <label className={cn("flex min-w-0 items-start gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold", className)}>
      <input className={cn("mt-1 h-5 w-5 shrink-0 accent-black", inputClassName)} type={type} {...props} />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}
