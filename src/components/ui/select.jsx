import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef(({ className, ...props }, ref) => (
  <select ref={ref} className={cn("h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:ring-2 focus:ring-violet-400", className)} {...props} />
));
Select.displayName = "Select";
