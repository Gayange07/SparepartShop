import * as React from "react";
import { GRADES, gradeLabel, type GradeKey } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useAllPartsRaw, type RawPart } from "@/lib/suppliers";
import { api } from "@/lib/api";
import { rs, centsToRupees } from "@/lib/utils";
import type { Supplier } from "@/lib/suppliers";
import { colomboDate } from "@/lib/dates";

type Line = {
  partId: number; partNo: string; name: string; grade: GradeKey;
  qty: string; freeQty: string; unitCost: string; newSellPrice: string; supplierPartNo: string;
};

export function GrnSheet({ open, onClose, onSaved, supplier }: {
  open: boolean; onClose: () => void; onSaved: () => void; supplier: Supplier | null;
}) {
  const parts = useAllPartsRaw();
  const [theirBillNo, setTheirBillNo] = React.useState("");
  const [billDate, setBillDate] = React.useState(() => colomboDate());
  const [lines, setLines] = React.useState<Line[]>([]);
  const [partQuery, setPartQuery] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [paidNow, setPaidNow] = React.useState("");
  const [method, setMethod] = React.useState<"cash" | "card" | "cheque" | "bank_transfer">("cash");
  const [chequeNo, setChequeNo] = React.useState("");
  const [chequeDate, setChequeDate] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTheirBillNo(""); setBillDate(colomboDate()); setLines([]); setPartQuery("");
    setDiscount(""); setPaidNow(""); setMethod("cash"); setChequeNo(""); setChequeDate(""); setErr("");
  }, [open]);

  if (!open || !supplier) return null;

  const results = partQuery.trim()
    ? parts.filter((p) => [p.partNo, p.name, p.manufacturer, ...p.supplierNumbers.filter((s) => s.supplierId === supplier.id).map((s) => s.supplierPartNo)]
      .join(" ").toLowerCase().includes(partQuery.trim().toLowerCase())).slice(0, 8)
    : [];

  const addLine = (p: RawPart) => {
    const theirNo = p.supplierNumbers.find((s) => s.supplierId === supplier.id)?.supplierPartNo ?? "";
    const defaultGrade: GradeKey = supplier.grades[0] ?? "GEN";
    setLines((ls) => [...ls, { partId: p.id, partNo: p.partNo, name: p.name, grade: defaultGrade, qty: "1", freeQty: "", unitCost: "", newSellPrice: "", supplierPartNo: theirNo }]);
    setPartQuery("");
  };

  const updateLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  const subtotalCents = lines.reduce((s, l) => s + Math.round((parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0) * 100), 0);
  const discountCents = Math.round((parseFloat(discount) || 0) * 100);
  const totalCents = Math.max(0, subtotalCents - discountCents);
  const owedAfter = Math.max(0, totalCents - Math.round((parseFloat(paidNow) || 0) * 100));
  const dueDate = supplier.termDays > 0 ? new Date(Date.now() + supplier.termDays * 86400000).toLocaleDateString() : null;

  const submit = async () => {
    if (!lines.length) return setErr("Add at least one item");
    for (const l of lines) {
      if (!parseFloat(l.qty)) return setErr(`Enter a quantity for ${l.name}`);
      if (!l.unitCost || parseFloat(l.unitCost) < 0) return setErr(`Enter the cost for ${l.name}`);
    }
    setBusy(true);
    const res = await api<{ error?: string }>(`/suppliers/${supplier.id}/grn`, {
      method: "POST",
      body: {
        theirBillNo, billDate, discountCents,
        lines: lines.map((l) => ({
          partId: l.partId, grade: l.grade, qty: parseInt(l.qty, 10) || 0, freeQty: parseInt(l.freeQty, 10) || 0,
          unitCostCents: Math.round((parseFloat(l.unitCost) || 0) * 100),
          newSellPriceCents: l.newSellPrice ? Math.round(parseFloat(l.newSellPrice) * 100) : undefined,
          supplierPartNo: l.supplierPartNo,
        })),
        paidNowCents: Math.round((parseFloat(paidNow) || 0) * 100),
        paymentMethod: method, chequeNo, chequeDate: chequeDate || undefined,
      },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save the GRN");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Receive stock (GRN) — ${supplier.name}`} className="md:max-w-3xl"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !lines.length}>{busy ? "Saving…" : "✔ Save — add to stock"}</Button></>}>
      <div className="space-y-4">
        <p className="text-[12.5px] text-muted-foreground">
          Credit terms: <b>{supplier.termDays > 0 ? `${supplier.termDays} days` : "Cash"}</b>
          {dueDate && <> — due on <b>{dueDate}</b></>}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Their bill no</Label><Input value={theirBillNo} onChange={(e) => setTheirBillNo(e.target.value)} /></div>
          <div><Label>Bill date</Label><Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
        </div>

        <div className="relative">
          <Label>Add an item</Label>
          <Input value={partQuery} onChange={(e) => setPartQuery(e.target.value)} placeholder="Type the supplier's part number or ours — the system finds our part automatically" />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-[0_8px_24px_rgba(28,33,36,.12)]">
              {results.map((p) => (
                <li key={p.id}><button type="button" onClick={() => addLine(p)} className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-secondary">
                  <b>{p.partNo}</b> {p.name} <span className="text-muted-foreground">{p.manufacturer}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="rounded-md border border-border p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words"><b>{l.partNo}</b> {l.name}</span>
                  <button type="button" aria-label={`Remove ${l.name}`} onClick={() => removeLine(i)} className="-mr-1.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded text-destructive hover:bg-destructive-soft">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
                  <div><Label>Grade</Label><Select value={l.grade} onChange={(e) => updateLine(i, { grade: e.target.value as GradeKey })}>
                    {GRADES.map((g) => <option key={g.key} value={g.key}>{gradeLabel(g.key)}</option>)}
                  </Select></div>
                  <div><Label>Supplier no</Label><Input value={l.supplierPartNo} onChange={(e) => updateLine(i, { supplierPartNo: e.target.value })} /></div>
                  <div><Label>Qty</Label><Input value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} inputMode="numeric" /></div>
                  <div><Label>Free</Label><Input value={l.freeQty} onChange={(e) => updateLine(i, { freeQty: e.target.value })} inputMode="numeric" placeholder="0" /></div>
                  <div><Label>Cost each</Label><Input value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} inputMode="decimal" /></div>
                  <div><Label>New sell price</Label><Input value={l.newSellPrice} onChange={(e) => updateLine(i, { newSellPrice: e.target.value })} inputMode="decimal" placeholder="keep current" /></div>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Leave "New sell price" empty to keep the current selling price.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-dashed border-[#C9D0CC] pt-3">
          <div><Label>Bill discount (Rs.)</Label><Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0.00" /></div>
          <div className="flex flex-col items-end justify-end text-right">
            <div className="text-sm text-muted-foreground">Subtotal {rs(centsToRupees(subtotalCents))}</div>
            <div className="font-cond text-xl font-bold">Total {rs(centsToRupees(totalCents))}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div><Label>Paid now (Rs.) — 0 = all on credit</Label><Input value={paidNow} onChange={(e) => setPaidNow(e.target.value)} inputMode="decimal" placeholder="0.00" /></div>
          <div><Label>Paid by</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option>
            </Select>
          </div>
        </div>
        {method === "cheque" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Cheque no</Label><Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} /></div>
            <div><Label>Cheque date</Label><Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} /></div>
          </div>
        )}
        <p className="text-sm">Owe after this: <b className={owedAfter > 0 ? "text-destructive" : ""}>{rs(centsToRupees(owedAfter))}</b></p>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
