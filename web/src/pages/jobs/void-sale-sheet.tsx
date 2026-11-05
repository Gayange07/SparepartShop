import * as React from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onVoided: () => void;
  saleId: number;
  invoiceNo: string;
};

export function VoidSaleSheet({ open, onClose, onVoided, saleId, invoiceNo }: Props) {
  const [reason, setReason] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setReason(""); setPassword(""); setErr("");
  }, [open]);

  const submit = async () => {
    if (!reason.trim()) return setErr("Enter a reason for voiding this bill");
    if (!password) return setErr("Enter the owner authorization password");
    setBusy(true);
    const res = await api<{ ok?: boolean; error?: string }>(`/sales/${saleId}/void`, {
      body: { reason: reason.trim(), ownerAuthPassword: password },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not void the bill");
    onVoided();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Void bill ${invoiceNo}`}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" onClick={submit} disabled={busy}>{busy ? "Voiding…" : "Void bill"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-md bg-destructive-soft p-3.5 text-sm text-destructive">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">This cannot be undone.</p>
            <p className="mt-0.5 text-[13px] opacity-80">Stock from this bill will be returned to inventory. If this bill came from a service job, the job will re-open.</p>
          </div>
        </div>

        <div>
          <Label>Reason for voiding *</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer changed mind, wrong item billed"
            autoFocus
          />
        </div>

        <div>
          <Label>Owner authorization password *</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
          <p className="mt-1 text-xs text-muted-foreground">Voiding a bill requires owner authorization. Every void is recorded in the activity log.</p>
        </div>

        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
