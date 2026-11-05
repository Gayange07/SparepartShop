import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { StaffMember } from "@/lib/staff";

export function AdvanceSheet({ open, onClose, onSaved, staff, period }: {
  open: boolean; onClose: () => void; onSaved: () => void; staff: StaffMember | null; period: string;
}) {
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (open) { setAmount(""); setNote(""); setErr(""); } }, [open]);

  if (!open || !staff) return null;

  const submit = async () => {
    const amountCents = Math.round((parseFloat(amount) || 0) * 100);
    if (amountCents <= 0) return setErr("Enter the amount");
    setBusy(true);
    const res = await api<{ error?: string }>("/advances", {
      method: "POST", body: { staffType: staff.staffType, staffId: staff.id, amountCents, period, note },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save the advance");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Advance for ${staff.name}`} description={`Deducted from ${period}'s pay`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save advance"}</Button></>}>
      <div className="space-y-3">
        <div><Label>Amount (Rs.) *</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus /></div>
        <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
