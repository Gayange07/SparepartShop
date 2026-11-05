import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl border border-border bg-card text-card-foreground", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-2 max-md:px-4", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("min-w-0 font-cond text-[19px] font-bold leading-tight", className)} {...p} />
);
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-5 pb-5 max-md:px-4 max-md:pb-4", className)} {...p} />
);
