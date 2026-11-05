import * as React from "react";
import { cn } from "@/lib/utils";

export type Column<T> = { key: string; header: string; cell: (row: T) => React.ReactNode; align?: "right"; className?: string; primary?: boolean; actions?: boolean };

/** Data table on desktop, stacked rows on phones */
export function DataTable<T>({ columns, rows, rowKey, empty = "Nothing to show." }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>{columns.map((c) => (
              <th key={c.key} className={cn("border-b border-border bg-[#FAFBFA] px-3 py-2 text-left text-xs font-semibold text-muted-foreground", c.align === "right" && "text-right")}>{c.header}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-b border-border-soft last:border-0 hover:bg-[#FAFCFB]">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-middle", c.align === "right" && "text-right tabular", c.className)}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden">
        {rows.map((r) => {
          const primary = columns.find((c) => c.primary) ?? columns[0];
          const actions = columns.find((c) => c.actions);
          return (
            <li key={rowKey(r)} className="border-b border-border-soft py-3 last:border-0">
              <div className="mb-1 text-[15.5px] font-semibold break-words [overflow-wrap:anywhere]">{primary.cell(r)}</div>
              <dl className="space-y-0.5">
                {columns.filter((c) => c !== primary && c !== actions && c.header).map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-4 text-sm">
                    <dt className="shrink-0 text-[13px] text-muted-foreground">{c.header}</dt>
                    <dd className="min-w-0 text-right tabular break-words">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
              {actions && <div className="mt-2.5 flex flex-wrap justify-end gap-2 [&>*]:flex-1">{actions.cell(r)}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
