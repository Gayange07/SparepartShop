import * as React from "react";
import { LuPlus, LuWrench, LuArrowRight, LuPencil, LuX, LuBan } from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useJobs, type Job } from "@/lib/jobs";
import { setPendingBill } from "@/lib/pending-bill";
import { JobDialog } from "@/pages/jobs/job-dialog";
import { CancelJobSheet } from "@/pages/jobs/cancel-job-sheet";
import { VoidSaleSheet } from "@/pages/jobs/void-sale-sheet";
import { f2 } from "@/lib/utils";
import type { Route } from "@/components/app-shell";

export function JobsPage({ go }: { go: (r: Route) => void }) {
  const [tab, setTab] = React.useState<"open" | "billed" | "cancelled">("open");
  const { jobs, loading, reload } = useJobs(tab);
  const toast = useToast();
  const [editing, setEditing] = React.useState<Job | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<Job | null>(null);
  const [voiding, setVoiding] = React.useState<Job | null>(null);

  const sendToPos = (job: Job) => {
    setPendingBill({
      jobId: job.job.id,
      mechanicId: job.job.mechanicId ?? undefined,
      customer: job.customer ? { id: job.customer.id, name: job.customer.name, phone: job.customer.phone } : undefined,
      vehicleNo: job.job.vehicleNo,
      lines: job.parts.map((p) => ({ partId: p.partId, grade: p.grade, qty: p.qty })),
      services: job.services.map((s) => ({ description: s.name, amountRupees: (s.priceCents * s.qty) / 100, mechanicId: job.job.mechanicId ?? undefined })),
    });
    go("pos");
  };

  const badgeVariant = (status: Job["job"]["status"]) => {
    if (status === "billed") return "success" as const;
    if (status === "cancelled") return "default" as const;
    return "info" as const;
  };
  const badgeLabel = (status: Job["job"]["status"]) =>
    status === "billed" ? "Billed" : status === "cancelled" ? "Cancelled" : "Open";

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 max-md:mb-3">
        <h1 className="font-cond text-[28px] font-bold leading-tight max-md:hidden">Service jobs</h1>
        {tab !== "cancelled" && (
          <Button className="max-md:w-full" onClick={() => setAdding(true)}><LuPlus />New service job</Button>
        )}
      </div>
      <Segmented className="mb-4" value={tab} onChange={setTab}
        options={[
          { value: "open", label: "Open" },
          { value: "billed", label: "Billed" },
          { value: "cancelled", label: "Cancelled" },
        ]} />

      {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
      {!loading && !jobs.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">No {tab} jobs.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map((j) => (
          <Card key={j.job.id} className={j.job.status === "cancelled" ? "opacity-70" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-cond text-lg font-bold leading-tight">{j.job.jobNo}</div>
                  <div className="text-sm text-muted-foreground">{j.job.vehicleNo || "—"}{j.job.model ? ` · ${j.job.model}` : ""}</div>
                </div>
                <Badge variant={badgeVariant(j.job.status)}>{badgeLabel(j.job.status)}</Badge>
              </div>

              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Customer</dt><dd className="min-w-0 text-right break-words">{j.customer?.name ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Mechanic</dt><dd className="flex items-center gap-1.5"><LuWrench className="size-3.5 text-faint" />{j.mechanic?.name ?? "—"}</dd></div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Work</dt>
                  <dd className="text-right">
                    {j.services.length} service{j.services.length === 1 ? "" : "s"}
                    {j.parts.length ? `, ${j.parts.reduce((s, p) => s + p.qty, 0)} part${j.parts.reduce((s, p) => s + p.qty, 0) > 1 ? "s" : ""}` : ""}
                  </dd>
                </div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Created</dt><dd>{new Date(j.job.createdAt).toLocaleDateString()}</dd></div>
                {j.job.status === "cancelled" && j.job.cancelReason && (
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-muted-foreground">Reason</dt>
                    <dd className="text-right text-destructive">{j.job.cancelReason}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border-soft pt-3">
                <span className="font-cond text-xl font-bold tabular">{f2(j.estimateCents / 100)}</span>
                {j.job.status === "open" && (
                  <div className="flex gap-2 max-md:grid max-md:w-full max-md:grid-cols-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(j)}><LuPencil />Open</Button>
                    <Button size="sm" onClick={() => sendToPos(j)}>Bill<LuArrowRight /></Button>
                  </div>
                )}
                {j.job.status === "billed" && (
                  <Button size="sm" variant="outline" className="max-md:w-full" onClick={() => go("sales")}>View bill</Button>
                )}
              </div>
              {j.job.status === "open" && (
                <button type="button" onClick={() => setCancelling(j)} className="mt-2 flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] font-medium text-destructive hover:underline">
                  <LuBan className="size-4" />Cancel this job
                </button>
              )}
              {j.job.status === "billed" && (
                <button type="button" onClick={() => setVoiding(j)} className="mt-2 flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] font-medium text-destructive hover:underline">
                  <LuX className="size-4" />Void this bill
                </button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <JobDialog open={adding} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); toast("Job saved"); reload(); }} job={null} />
      <JobDialog open={!!editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast("Job saved"); reload(); }} job={editing} />

      <CancelJobSheet
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={() => { setCancelling(null); toast("Job cancelled"); reload(); }}
        job={cancelling}
      />

      <VoidSaleSheet
        open={!!voiding && !!voiding.job.saleId}
        onClose={() => setVoiding(null)}
        onVoided={() => { setVoiding(null); toast("Bill voided — job is open again"); reload(); }}
        saleId={voiding?.job.saleId ?? 0}
        invoiceNo={voiding ? `job ${voiding.job.jobNo}` : ""}
      />
    </>
  );
}
