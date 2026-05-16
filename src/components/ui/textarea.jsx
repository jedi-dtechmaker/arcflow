import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn("min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:ring-2 focus:ring-violet-400", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
