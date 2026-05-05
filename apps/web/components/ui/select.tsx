import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => {
  return <select ref={ref} className={cn("min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold", className)} {...props} />;
});

Select.displayName = "Select";
