import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "primary", ...props }, ref) => {
  const variantClass = variant === "danger" ? "bg-[var(--danger)] text-white" : variant === "secondary" ? "bg-white" : "bg-[var(--primary)]";

  return <button ref={ref} className={cn("pixel-button px-4 py-2", variantClass, className)} {...props} />;
});

Button.displayName = "Button";
