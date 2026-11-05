import * as React from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Job } from "@/lib/jobs";

type Props = {
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
  job: Job | null;
};

export function CancelJobSheet({ open, onClose, onCancelled, job }: Props) {
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setReason(""); setErr("");
  }, [open]);

  const submit = async () => {
    if (!job) return;
    if (!reason.trim()) return setErr("Enter a reason for cancelling this job");
    setBusy(true);
    const res = await api<{ ok?: boolean; error?: string }>(`/jobs/${job.job.id}/cancel`, {
      body: { reason: reason.trim() },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not cancel the job");
    onCancelled();
  };

  if (!job) return null;

  return (
    <Sheet open={open} onClose={onClose} title={`Cancel job ${job.job.jobNo}`}
      footer={<>
        <Button variant="outline" onClick={onClose}>Keep job open</Button>
        <Button variant="destructive" onClick={submit} disabled={busy}>{busy ? "Cancelling…" : "Cancel job"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-md bg-destructive-soft p-3.5 text-sm text-destructive">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Job {job.job.jobNo} will be marked cancelled.</p>
            <p className="mt-0.5 text-[13px] opacity-80">No stock has been deducted — this only records that the job was not completed. The reason will appear in the activity log.</p>
          </div>
        </div>

        <dl className="space-y-1 rounded-md border border-border bg-secondary p-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Job</dt><dd className="font-medium">{job.job.jobNo}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Customer</dt><dd>{job.customer?.name ?? "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Vehicle</dt><dd>{job.job.vehicleNo || "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Mechanic</dt><dd>{job.mechanic?.name ?? "—"}</dd></div>
        </dl>

        <div>
          <Label>Reason for cancelling *</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer took vehicle elsewhere, parts not available"
            autoFocus
          />
          <p className="mt-1 text-xs text-muted-foreground">Required. Recorded in the activity log with your name and the time.</p>
        </div>

        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
