import * as React from "react";
import { GRADES, gradeLabel, type GradeKey } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useAllPartsRaw, type RawPart } from "@/lib/suppliers";
import { api } from "@/lib/api";
import type { Supplier } from "@/lib/suppliers";

export function SupplierReturnSheet({ open, onClose, onReturned, supplier }: {
  open: boolean; onClose: () => void; onReturned: () => void; supplier: Supplier | null;
}) {
  const parts = useAllPartsRaw();
  const [partQuery, setPartQuery] = React.useState("");
  const [part, setPart] = React.useState<RawPart | null>(null);
  const [grade, setGrade] = React.useState<GradeKey>("GEN");
  const [qty, setQty] = React.useState("1");
  const [cost, setCost] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPartQuery(""); setPart(null); setGrade("GEN"); setQty("1"); setCost(""); setReason(""); setErr("");
  }, [open]);

  if (!open || !supplier) return null;

  const results = partQuery.trim() && !part
    ? parts.filter((p) => [p.partNo, p.name, p.manufacturer].join(" ").toLowerCase().includes(partQuery.trim().toLowerCase())).slice(0, 8)
    : [];

  const pickPart = (p: RawPart) => { setPart(p); setPartQuery(`${p.partNo} ${p.name}`); };
  const availableQty = part?.grades[grade]?.qty ?? 0;

  const submit = async () => {
    if (!part) return setErr("Search and pick the part");
    const qtyNum = parseInt(qty, 10) || 0;
    if (qtyNum <= 0) return setErr("Enter a quantity");
    if (qtyNum > availableQty) return setErr(`Only ${availableQty} in stock`);
    const costCents = Math.round((parseFloat(cost) || 0) * 100);
    if (!reason.trim()) return setErr("Enter a reason");
    setBusy(true);
    const res = await api<{ error?: string }>(`/suppliers/${supplier.id}/returns`, {
      method: "POST", body: { partId: part.id, grade, qty: qtyNum, unitCostCents: costCents, reason: reason.trim() },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save the return");
    onReturned();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Return to ${supplier.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save return"}</Button></>}>
      <div className="space-y-3">
        <div className="relative">
          <Label>Part *</Label>
          <Input value={partQuery} onChange={(e) => { setPartQuery(e.target.value); setPart(null); }} placeholder="Search part no or name" />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-[0_8px_24px_rgba(28,33,36,.12)]">
              {results.map((p) => (
                <li key={p.id}><button type="button" onClick={() => pickPart(p)} className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-secondary">
                  <b>{p.partNo}</b> {p.name}
                </button></li>
              ))}
            </ul>
          )}
        </div>
        {part && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Grade</Label>
                <Select value={grade} onChange={(e) => { const g = e.target.value as GradeKey; setGrade(g); setCost(part.grades[g]?.cost !== undefined ? String(part.grades[g]!.cost! / 100) : ""); }}>
                  {GRADES.map((g) => <option key={g.key} value={g.key}>{gradeLabel(g.key)}</option>)}
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">{availableQty} in stock</p>
              </div>
              <div><Label>Qty *</Label><Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" /></div>
            </div>
            <div><Label>Cost each (Rs.)</Label><Input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" /></div>
          </>
        )}
        <div><Label>Reason *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="damaged / wrong part" /></div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
