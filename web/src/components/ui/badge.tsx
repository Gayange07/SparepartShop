import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-muted text-muted-foreground",
      success: "bg-gen-soft text-gen",
      info: "bg-aa-soft text-aa",
      warning: "bg-warning-soft text-warning",
      danger: "bg-destructive-soft text-destructive",
      GEN: "bg-gen-soft text-gen",
      AA: "bg-aa-soft text-aa",
      A: "bg-agr-soft text-agr",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...p} />;
}
