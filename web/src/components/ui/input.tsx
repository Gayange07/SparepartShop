import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-md border border-input bg-card px-3 h-9 text-sm text-foreground placeholder:text-faint transition-colors focus:outline-none focus:border-ring focus:ring-3 focus:ring-accent disabled:bg-muted disabled:text-muted-foreground max-md:h-11 max-md:text-base";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, className)} {...p} />
));
Input.displayName = "Input";

const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%2366707A' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E")`;
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, style, ...p }, ref) => (
  <select ref={ref} className={cn(field, "appearance-none pr-8 bg-no-repeat bg-[position:right_11px_center]", className)} style={{ backgroundImage: chevron, ...style }} {...p} />
));
Select.displayName = "Select";

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1.5 block text-[12.5px] text-muted-foreground", className)} {...p} />
);

export function Checkbox({ label, className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 text-sm max-md:min-h-11", className)}>
      <input type="checkbox" className="size-[18px] accent-primary" {...p} />
      {label}
    </label>
  );
}
