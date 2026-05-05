import * as React from "react";
import { cn } from "@/lib/utils";

export function Dialog({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("fixed inset-0 z-50 grid place-items-center bg-black/40 p-4", className)} {...props} />;
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pixel-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-white p-5", className)} {...props} />;
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 border-b-3 border-black pb-3", className)} {...props} />;
}
