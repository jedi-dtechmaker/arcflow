import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn("flex h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-base text-white outline-none transition placeholder:text-slate-500 focus:ring-2 focus:ring-violet-400", className)}
    {...props}
  />
));
Input.displayName = "Input";
