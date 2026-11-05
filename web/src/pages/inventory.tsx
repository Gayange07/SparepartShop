import * as React from "react";
import { LuSearch, LuPlus, LuArrowDownUp } from "react-icons/lu";
import { GRADES, type GradeKey } from "shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Checkbox } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { useParts, isLow, LOW_STOCK_FLAG, type Part } from "@/lib/parts";
import { partMatches, searchWords } from "@/lib/part-search";
import { useToast } from "@/components/ui/toast";
import { cn, f2 } from "@/lib/utils";
import { PartDialog } from "@/pages/inventory/part-dialog";
import { StockDialog } from "@/pages/inventory/stock-dialog";
import { ImportDialog } from "@/pages/inventory/import-dialog";

const total = (p: Part) => GRADES.reduce((s, g) => s + (p.grades[g.key]?.qty ?? 0), 0);

export function InventoryPage({ isOwner, canStock, canCost }: { isOwner: boolean; canStock: boolean; canCost: boolean }) {
  const { parts, loading, reload } = useParts();
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [mfr, setMfr] = React.useState("");
  const [cat, setCat] = React.useState("");
  const [lowOnly, setLowOnly] = React.useState(() => {
    const on = sessionStorage.getItem(LOW_STOCK_FLAG) === "1";
    sessionStorage.removeItem(LOW_STOCK_FLAG);
    return on;
  });
  const [sortQty, setSortQty] = React.useState(false);
  const [editing, setEditing] = React.useState<Part | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [stocking, setStocking] = React.useState<Part | null>(null);
  const [importing, setImporting] = React.useState(false);

  const manufacturers = React.useMemo(() => [...new Set(parts.map((p) => p.manufacturer))].sort(), [parts]);
  const categories = React.useMemo(() => [...new Set(parts.map((p) => p.category).filter(Boolean))].sort(), [parts]);
  const words = searchWords(q);
  let rows = parts.filter((p) => partMatches(p, words) &&(!mfr || p.manufacturer === mfr) && (!cat || p.category === cat) && (!lowOnly || GRADES.some((g) => isLow(p.grades[g.key]))));
  if (sortQty) rows = [...rows].sort((a, b) => total(a) - total(b));

  const cell = (p: Part, k: GradeKey) => {
    const g = p.grades[k];
    if (!g) return <span className="text-faint">—</span>;
    return <span><b className={cn("tabular", isLow(g) && "text-destructive")}>{g.qty}</b> <span className="text-muted-foreground">@ {f2(g.price)}</span>{canCost && g.cost !== undefined && <span className="block text-[11.5px] text-faint">cost {f2(g.cost)}</span>}</span>;
  };

  const onSaved = (msg: string) => { setAdding(false); setEditing(null); toast(msg); reload(); };

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 max-md:mb-3 max-md:flex-wrap">
        <h1 className="font-cond text-[28px] font-bold leading-tight max-md:hidden">Inventory</h1>
        {canStock && (
          <div className="flex gap-2 max-md:w-full">
            <Button variant="outline" className="max-md:flex-1" onClick={() => setImporting(true)}>Import Excel (CSV)</Button>
            <Button className="max-md:flex-1" onClick={() => setAdding(true)}><LuPlus />Add part</Button>
          </div>
        )}
      </div>
      <Card>
        <CardContent className="pt-5 max-md:pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-[2]">
              <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part no, name, model or category" className="pl-9" />
            </div>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="min-w-[150px] flex-1" aria-label="Category">
              <option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select value={mfr} onChange={(e) => setMfr(e.target.value)} className="min-w-[150px] flex-1" aria-label="Manufacturer">
              <option value="">All makes</option>{manufacturers.map((m) => <option key={m}>{m}</option>)}
            </Select>
            <Checkbox label="Low stock only" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            <Button variant="ghost" size="sm" onClick={() => setSortQty(!sortQty)}><LuArrowDownUp />{sortQty ? "Lowest stock first" : "Sort by part no"}</Button>
          </div>
          <p className="mt-3 mb-1 text-[12.5px] text-muted-foreground">{loading ? "Loading…" : `${rows.length} parts`}{canCost ? "" : ". Cost prices are hidden for staff"}</p>
          <DataTable rowKey={(p) => String(p.id)} rows={rows} columns={[
            { key: "no", header: "Part", primary: true, cell: (p) => <><span className="font-cond font-bold tabular">{p.partNo}</span>&ensp;{p.name}{isOwner && p.priceEstimated && <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">price to confirm</span>}<div className="text-[12.5px] font-normal text-muted-foreground">{p.manufacturer}, {p.models.join(", ")}</div></> },
            { key: "cat", header: "Category", cell: (p) => p.category || <span className="text-faint">—</span> },
            { key: "rack", header: "Rack", cell: (p) => p.rack },
            ...GRADES.map((g) => ({ key: g.key, header: g.label, cell: (p: Part) => cell(p, g.key) })),
            { key: "t", header: "Total qty", align: "right" as const, cell: (p: Part) => <b>{total(p)}</b> },
            { key: "u", header: "Last change", cell: (p: Part) => <span className="text-muted-foreground">{p.updatedByName ?? "—"}</span> },
            ...(canStock ? [{ key: "a", header: "", actions: true, cell: (p: Part) => <><Button size="sm" variant="outline" onClick={() => setStocking(p)}>Stock</Button><Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button></> }] : []),
          ]} />
        </CardContent>
      </Card>

      <PartDialog open={adding} onClose={() => setAdding(false)} onSaved={() => onSaved("Part added")} part={null} owner={isOwner} canCost={canCost} />
      <PartDialog open={!!editing} onClose={() => setEditing(null)} onSaved={() => onSaved("Part saved")} part={editing} owner={isOwner} canCost={canCost} />
      <StockDialog open={!!stocking} onClose={() => setStocking(null)} onSaved={() => { toast("Stock updated"); reload(); }} part={stocking} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onImported={reload} />
    </>
  );
}
