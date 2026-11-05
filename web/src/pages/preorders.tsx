import * as React from "react";
import { LuPlus, LuClock } from "react-icons/lu";
import { isPreOrderUrgent, daysUntil } from "shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { DataTable } from "@/components/ui/table";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { usePreOrders, type PreOrder } from "@/lib/preorders";
import { setPendingBill } from "@/lib/pending-bill";
import { PreOrderDialog } from "@/pages/preorders/preorder-dialog";
import { api } from "@/lib/api";
import { rs, centsToRupees } from "@/lib/utils";
import type { Route } from "@/components/app-shell";

const TABS = ["pending", "arrived", "delivered", "cancelled"] as const;

function DueBadge({ promisedDate, status }: { promisedDate: string; status: PreOrder["status"] }) {
  if (status !== "pending" && status !== "arrived") return <span>{promisedDate}</span>;
  const d = daysUntil(promisedDate);
  const text = d < 0 ? `Overdue ${-d}d` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `In ${d} days`;
  return <span>{promisedDate} <Badge variant={isPreOrderUrgent(promisedDate) ? "danger" : "success"}>{text}</Badge></span>;
}

export function PreOrdersPage({ go }: { go: (r: Route) => void }) {
  const [tab, setTab] = React.useState<typeof TABS[number]>("pending");
  const { preOrders, loading, reload } = usePreOrders(tab);
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<PreOrder | null>(null);
  const [cancelling, setCancelling] = React.useState<PreOrder | null>(null);
  const [busy, setBusy] = React.useState(false);

  const setStatus = async (id: number, status: PreOrder["status"]) => {
    setBusy(true);
    const res = await api<{ error?: string }>(`/preorders/${id}/status`, { body: { status } });
    setBusy(false);
    if (!res.ok) return toast(res.data.error ?? "Could not update");
    toast(status === "cancelled" ? "Pre-order cancelled" : status === "arrived" ? "Marked as arrived. Call the customer." : "Pre-order updated");
    setCancelling(null);
    reload();
  };

  const deliver = (p: PreOrder) => {
    if (!p.part || !p.grade) {
      toast("Not linked to a part — bill it manually in the POS, then mark delivered.");
      return;
    }
    setPendingBill({
      preOrderId: p.id,
      customer: p.customer ? { id: p.customer.id, name: p.customer.name, phone: p.customer.phone } : undefined,
      vehicleNo: p.vehicle,
      lines: [{ partId: p.part.id, grade: p.grade, qty: p.qty }],
      services: [],
      advancePaidRupees: centsToRupees(p.advancePaidCents),
    });
    go("pos");
  };

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 max-md:mb-3">
        <h1 className="font-cond text-[28px] font-bold leading-tight max-md:hidden">Pre-orders</h1>
        <Button className="max-md:w-full" onClick={() => setAdding(true)}><LuPlus />New pre-order</Button>
      </div>
      <Segmented className="mb-4" value={tab} onChange={setTab} options={TABS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
      <Card>
        <CardContent className="pt-5">
          <p className="mb-3 text-[12.5px] text-muted-foreground"><LuClock className="mr-1 inline size-3.5" />Red = promised date is within 2 days or already passed.</p>
          <DataTable rowKey={(p) => String(p.id)} rows={preOrders} empty={loading ? "Loading…" : "No pre-orders."} columns={[
            { key: "no", header: "No", cell: (p) => p.preOrderNo },
            { key: "promised", header: "Promised", cell: (p) => <DueBadge promisedDate={p.promisedDate} status={p.status} /> },
            { key: "cust", header: "Customer", primary: true, cell: (p) => <>{p.customer?.name ?? "—"}{p.customer?.phone && <a href={`tel:${p.customer.phone}`} className="block text-[13px] font-normal text-primary underline-offset-2 hover:underline">{p.customer.phone}</a>}</> },
            { key: "part", header: "Part wanted", cell: (p) => <>{p.partDescription}{p.note && <div className="text-[12.5px] text-muted-foreground">{p.note}</div>}</> },
            { key: "qty", header: "Qty", align: "right" as const, cell: (p) => p.qty },
            { key: "adv", header: "Advance", align: "right" as const, cell: (p) => rs(centsToRupees(p.advancePaidCents)) },
            {
              key: "a", header: "", actions: true, cell: (p) => (
                p.status === "pending" ? <>
                  <Button size="sm" onClick={() => setStatus(p.id, "arrived")}>Arrived</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setCancelling(p)}>Cancel</Button>
                </> : p.status === "arrived" ? <>
                  <Button size="sm" onClick={() => deliver(p)}>Deliver &amp; bill</Button>
                  {p.customer?.phone && <a href={`tel:${p.customer.phone}`} className={buttonVariants({ size: "sm", variant: "outline" })}>Call</a>}
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                </> : null
              ),
            },
          ]} />
        </CardContent>
      </Card>

      <Sheet open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this pre-order?"
        description={cancelling ? `${cancelling.preOrderNo} · ${cancelling.partDescription} for ${cancelling.customer?.name ?? "customer"}` : ""}
        footer={<><Button variant="outline" onClick={() => setCancelling(null)}>Keep it</Button><Button variant="destructive" disabled={busy} onClick={() => cancelling && setStatus(cancelling.id, "cancelled")}>{busy ? "Cancelling…" : "Yes, cancel"}</Button></>}>
        {cancelling && cancelling.advancePaidCents > 0
          ? <p className="text-sm">The customer paid an advance of <b>{rs(centsToRupees(cancelling.advancePaidCents))}</b>. Remember to give it back.</p>
          : <p className="text-sm text-muted-foreground">It will move to the Cancelled tab.</p>}
      </Sheet>

      <PreOrderDialog open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast("Pre-order saved"); reload(); }} preOrder={null} />
      <PreOrderDialog open={!!editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Pre-order saved"); reload(); }} preOrder={editing} />
    </>
  );
}
