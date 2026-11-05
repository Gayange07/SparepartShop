import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { rs, centsToRupees } from "@/lib/utils";
import type { Supplier } from "@/lib/suppliers";

export function SupplierPaymentSheet({ open, onClose, onPaid, supplier, balanceCents }: {
  open: boolean; onClose: () => void; onPaid: () => void; supplier: Supplier | null; balanceCents: number;
}) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"cash" | "card" | "cheque" | "bank_transfer">("cash");
  const [chequeNo, setChequeNo] = React.useState("");
  const [chequeDate, setChequeDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAmount(balanceCents > 0 ? String(centsToRupees(balanceCents)) : "");
    setMethod("cash"); setChequeNo(""); setChequeDate(""); setNote(""); setErr("");
  }, [open, balanceCents]);

  if (!open || !supplier) return null;

  const submit = async () => {
    const amountCents = Math.round((parseFloat(amount) || 0) * 100);
    if (amountCents <= 0) return setErr("Enter the amount");
    if (method === "cheque" && (!chequeNo.trim() || !chequeDate)) return setErr("Enter the cheque number and date");
    setBusy(true);
    const res = await api<{ error?: string }>(`/suppliers/${supplier.id}/payments`, {
      method: "POST", body: { amountCents, method, chequeNo, chequeDate: chequeDate || undefined, note },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not record the payment");
    onPaid();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Pay ${supplier.name}`} description={`You owe ${rs(centsToRupees(balanceCents))}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button></>}>
      <div className="space-y-3">
        <div><Label>Amount *</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus /></div>
        <div><Label>Method</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option>
          </Select>
        </div>
        {method === "cheque" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Cheque no *</Label><Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} /></div>
            <div><Label>Cheque date *</Label><Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} /></div>
          </div>
        )}
        <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
