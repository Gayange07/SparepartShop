import * as React from "react";
import { GRADES, gradeLabel, type GradeKey, type StockMovementInput } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Part } from "@/lib/parts";

type Movement = { id: number; grade: GradeKey; qtyDelta: number; note: string; createdAt: string };

export function StockDialog({ open, onClose, onSaved, part }: {
  open: boolean; onClose: () => void; onSaved: () => void; part: Part | null;
}) {
  const [grade, setGrade] = React.useState<GradeKey>("GEN");
  const [action, setAction] = React.useState<"in" | "out" | "set">("in");
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [movements, setMovements] = React.useState<Movement[]>([]);

  const loadMovements = React.useCallback(async () => {
    if (!part) return;
    const res = await api<{ movements: Movement[] }>(`/parts/${part.id}/movements`, { method: "GET" });
    if (res.ok) setMovements(res.data.movements);
  }, [part]);

  React.useEffect(() => {
    if (!open || !part) return;
    setGrade(GRADES.find((g) => part.grades[g.key])?.key ?? "GEN");
    setAction("in"); setQty(""); setNote(""); setErr("");
    loadMovements();
  }, [open, part, loadMovements]);

  if (!part) return null;

  const carried = GRADES.filter((g) => part.grades[g.key]);
  const current = part.grades[grade]?.qty ?? 0;
  const n = Math.floor(Number(qty));
  const valid = qty !== "" && !Number.isNaN(n) && n >= 0;
  const newQty = !valid ? null : action === "in" ? current + n : action === "out" ? current - n : n;

  const submit = async () => {
    if (!valid || (action !== "set" && n === 0)) return setErr("Enter a quantity");
    if (newQty !== null && newQty < 0) return setErr(`Only ${current} in stock, so ${n} cannot be taken out`);
    if (!note.trim()) return setErr("Write the reason, for example damaged or counted on shelf");
    setBusy(true);
    const payload: StockMovementInput = { grade, action, qty: n, note: note.trim() };
    const res = await api<{ error?: string }>(`/parts/${part.id}/stock`, { body: payload });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not update stock");
    setQty(""); setNote(""); setErr("");
    onSaved();
    loadMovements();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Stock — ${part.partNo} ${part.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
      <div className="space-y-3">
        <p className="text-sm">
          {carried.map((g) => <span key={g.key} className="mr-4 inline-block">{gradeLabel(g.key)} <b>{part.grades[g.key]!.qty}</b></span>)}
        </p>
        {!carried.length && <p className="text-sm text-warning">This part has no selling price for any grade yet. Set a price in Edit first.</p>}
        <div className="grid grid-cols-[150px_1fr_100px] gap-2 max-md:grid-cols-2">
          <div className="max-md:col-span-2"><Label>What happened</Label>
            <Select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
              <option value="in">Add stock (received)</option>
              <option value="out">Take out (damaged or lost)</option>
              <option value="set">Set exact count (after checking)</option>
            </Select>
          </div>
          <div className="min-w-0 md:order-first"><Label>Grade</Label>
            <Select value={grade} onChange={(e) => setGrade(e.target.value as GradeKey)}>
              {carried.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </Select>
          </div>
          <div className="min-w-0"><Label>{action === "set" ? "Count on shelf" : "Quantity"}</Label>
            <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        {newQty !== null && (
          <p className={cn("rounded-md px-3 py-2 text-sm", newQty < 0 ? "bg-destructive-soft text-destructive" : "bg-accent")}>
            {gradeLabel(grade)}: {current} now → <b className="tabular">{newQty < 0 ? "not enough stock" : `${newQty} after this`}</b>
          </p>
        )}
        <div><Label>Reason *</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. damaged, counted on shelf" /></div>
        <p className="text-xs text-muted-foreground">Tip: stock from suppliers should be entered in Suppliers → Receive stock so the bill is recorded too.</p>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}

        <h3 className="mt-3 font-cond text-lg font-bold">Recent movements</h3>
        <DataTable rowKey={(m) => String(m.id)} rows={movements} empty="No movements yet." columns={[
          { key: "date", header: "Date", primary: true, cell: (m) => new Date(m.createdAt).toLocaleString() },
          { key: "grade", header: "Grade", cell: (m) => gradeLabel(m.grade) },
          { key: "qty", header: "Qty", align: "right" as const, cell: (m) => (m.qtyDelta > 0 ? "+" : "") + m.qtyDelta },
          { key: "note", header: "Reason", cell: (m) => m.note },
        ]} />
      </div>
    </Sheet>
  );
}
