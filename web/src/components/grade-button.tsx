import { cn, f2 } from "@/lib/utils";
import { gradeLabel, type GradeKey } from "shared";
import { isLow, type GradeStock } from "@/lib/parts";

const bar: Record<GradeKey, string> = { GEN: "before:bg-gen", AA: "before:bg-aa", A: "before:bg-agr" };
const txt: Record<GradeKey, string> = { GEN: "text-gen", AA: "text-aa", A: "text-agr" };

/** One grade of one part: label, price, stock. The core touch target of the POS. */
export function GradeButton({ grade: gradeKey, stock, inBill, onAdd }: { grade: GradeKey; stock: GradeStock; inBill: number; onAdd: () => void }) {
  const g = stock;
  const left = g.qty - inBill;
  return (
    <button disabled={left <= 0} onClick={onAdd}
      className={cn("relative flex w-[116px] cursor-pointer flex-col items-start overflow-hidden rounded-md border border-border bg-card py-1.5 pr-2 pl-3 text-left text-xs",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] hover:border-[#B9C4BF] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40",
        "max-md:w-auto max-md:flex-1 max-md:py-2", bar[gradeKey])}>
      <span className={cn("font-semibold", txt[gradeKey])}>{gradeLabel(gradeKey)}</span>
      <span className="font-cond text-[15px] font-bold tabular">{f2(g.price)}</span>
      <span className={isLow(g) ? "font-semibold text-destructive" : "text-muted-foreground"}>
        {g.qty ? `${g.qty} in stock` : "Out of stock"}
      </span>
      {inBill > 0 && <span aria-label={`${inBill} on the bill`} className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">{inBill}</span>}
    </button>
  );
}
