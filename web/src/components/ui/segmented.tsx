import { cn } from "@/lib/utils";

/** Segmented control (shadcn Tabs pattern) */
export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 rounded-lg bg-[#E7EBE9] p-1", className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("flex-1 cursor-pointer rounded-md px-3 py-2 text-sm max-md:py-2.5 font-semibold text-muted-foreground transition-colors",
            value === o.value && "bg-card text-foreground shadow-[0_1px_2px_rgba(36,41,45,.12)]")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 pb-1 md:mx-0 md:px-0 [scrollbar-width:none]">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm max-md:py-2",
            value === o.value ? "border-foreground bg-foreground text-white" : "border-input bg-card")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
