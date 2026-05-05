import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return <input ref={ref} className={cn("min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold", className)} {...props} />;
});

Input.displayName = "Input";
