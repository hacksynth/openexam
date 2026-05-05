import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={cn("min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold leading-7", className)} {...props} />;
});

Textarea.displayName = "Textarea";
