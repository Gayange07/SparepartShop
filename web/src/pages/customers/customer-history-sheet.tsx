import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { rs, f2, centsToRupees } from "@/lib/utils";
import { fetchCustomerDetail, fetchCustomerStatement, type Customer, type CustomerDetail, type LedgerRow } from "@/lib/customers";

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 text-center ${className ?? ""}`}>
      <div className="text-[12.5px] text-muted-foreground">{label}</div>
      <div className="font-cond text-lg font-bold tabular break-words">{value}</div>
    </div>
  );
}

function StatementSheet({ customerId, onClose, onBack }: { customerId: number | null; onClose: () => void; onBack: () => void }) {
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [ledger, setLedger] = React.useState<LedgerRow[]>([]);

  React.useEffect(() => {
    if (!customerId) return;
    fetchCustomerStatement(customerId).then((r) => { if (r.ok) { setCustomer(r.data.customer); setLedger(r.data.ledger); } });
  }, [customerId]);

  if (!customerId) return null;
  return (
    <Sheet open={!!customerId} onClose={onClose} title={`Credit statement — ${customer?.name ?? ""}`}
      footer={<><Button variant="outline" onClick={onBack}>← Back</Button><Button variant="outline" onClick={onClose} className="md:ml-auto">Close</Button></>}>
      <DataTable rowKey={(r) => String(r.i)} rows={ledger.map((r, i) => ({ ...r, i }))} empty="No credit activity yet." columns={[
        { key: "date", header: "Date", cell: (r) => new Date(r.date).toLocaleDateString() },
        { key: "ref", header: "Ref", cell: (r) => r.ref || "—" },
        { key: "details", header: "Details", primary: true, cell: (r) => r.details },
        { key: "owed", header: "Owed +", align: "right" as const, cell: (r) => r.owedCents > 0 ? rs(centsToRupees(r.owedCents)) : "—" },
        { key: "paid", header: "Paid −", align: "right" as const, cell: (r) => r.paidCents > 0 ? rs(centsToRupees(r.paidCents)) : "—" },
        { key: "bal", header: "Balance", align: "right" as const, cell: (r) => rs(centsToRupees(r.balanceCents)) },
      ]} />
    </Sheet>
  );
}

export function ReceivePaymentSheet({ customerId, balanceCents, onClose, onReceived }: {
  customerId: number | null; balanceCents: number; onClose: () => void; onReceived: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"cash" | "card" | "cheque">("cash");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [overOk, setOverOk] = React.useState(false);

  React.useEffect(() => {
    if (!customerId) return;
    setAmount(""); setMethod("cash"); setNote(""); setErr(""); setOverOk(false);
  }, [customerId]);

  if (!customerId) return null;
  const submit = async () => {
    const amountCents = Math.round((parseFloat(amount) || 0) * 100);
    if (amountCents <= 0) return setErr("Enter the amount");
    if (amountCents > balanceCents && !overOk) {
      setOverOk(true);
      return setErr(`That is more than the ${rs(centsToRupees(balanceCents))} owed. Tap "Save as advance" to keep the extra as an advance.`);
    }
    setBusy(true);
    const res = await api<{ error?: string }>(`/customers/${customerId}/payments`, { method: "POST", body: { amountCents, method, note } });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not record the payment");
    onReceived();
  };

  return (
    <Sheet open={!!customerId} onClose={onClose} title="Receive payment" description={`Owes: ${rs(centsToRupees(balanceCents))}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : overOk ? "Save as advance" : "Receive payment"}</Button></>}>
      <div className="space-y-3">
        <div><Label>Amount received (Rs.) *</Label><Input value={amount} onChange={(e) => { setAmount(e.target.value); setOverOk(false); setErr(""); }} inputMode="decimal" placeholder={balanceCents > 0 ? `Owes ${f2(centsToRupees(balanceCents))}` : ""} autoFocus />
          {balanceCents > 0 && (
            <button type="button" onClick={() => { setAmount(String(centsToRupees(balanceCents))); setOverOk(false); setErr(""); }}
              className="mt-1 min-h-10 cursor-pointer text-[13px] font-medium text-primary underline underline-offset-2">Paying it all ({rs(centsToRupees(balanceCents))})</button>
          )}
        </div>
        <div><Label>Method</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option>
          </Select>
        </div>
        <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}

export function CustomerHistorySheet({ customerId, onClose }: { customerId: number | null; onClose: () => void }) {
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);
  const [showStatement, setShowStatement] = React.useState(false);
  const [showReceive, setShowReceive] = React.useState(false);
  const toast = useToast();

  const reload = React.useCallback(() => {
    if (!customerId) return;
    fetchCustomerDetail(customerId).then((r) => r.ok && setDetail(r.data));
  }, [customerId]);

  React.useEffect(() => { setDetail(null); reload(); }, [customerId, reload]);

  if (!customerId) return null;
  const c = detail?.customer;
  const subtitle = c ? [c.phone, c.vehicleNo, [c.manufacturer, c.model].filter(Boolean).join(" "), c.nic && `NIC ${c.nic}`, c.address].filter(Boolean).join(" · ") : "";

  return (
    <>
      <Sheet open={!showStatement && !showReceive} onClose={onClose}
        title={c?.name ?? "Customer"}
        description={detail ? <>Owes <span className={detail.balanceCents > 0 ? "font-semibold text-destructive" : "font-semibold"}>{rs(centsToRupees(detail.balanceCents))}</span>{subtitle && <> · {subtitle}</>}</> : undefined}
        className="md:max-w-2xl"
        footer={<>
          <Button variant="outline" onClick={() => setShowStatement(true)}>Credit statement</Button>
          {detail && detail.balanceCents > 0 && <Button onClick={() => setShowReceive(true)}>Receive payment</Button>}
          <Button variant="outline" onClick={onClose} className="max-md:hidden md:ml-auto">Close</Button>
        </>}>
        {!detail ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Stat label="Total spent" value={rs(centsToRupees(detail.totalSpentCents))} className="max-md:col-span-2" />
              <Stat label="Bills" value={String(detail.billsCount)} />
              <Stat label="Service jobs" value={String(detail.jobsCount)} />
            </div>

            <div>
              <h3 className="mb-2 font-cond text-lg font-bold">Everything bought</h3>
              <DataTable rowKey={(r) => `${r.saleId}-${r.item}-${r.qty}`} rows={detail.bought} empty="No purchases yet." columns={[
                { key: "date", header: "Date", cell: (r) => new Date(r.date).toLocaleDateString() },
                { key: "bill", header: "Bill", cell: (r) => <>{r.invoiceNo}{r.voided && <Badge variant="danger" className="ml-1">Voided</Badge>}</> },
                { key: "item", header: "Item", primary: true, cell: (r) => r.item },
                { key: "grade", header: "Grade", cell: (r) => r.grade ? <Badge variant={r.grade as "GEN" | "AA" | "A"}>{r.grade}</Badge> : <Badge variant="info">Service</Badge> },
                { key: "qty", header: "Qty", align: "right" as const, cell: (r) => r.qty },
                { key: "amt", header: "Amount", align: "right" as const, cell: (r) => rs(centsToRupees(r.amountCents)) },
              ]} />
            </div>

            <div>
              <h3 className="mb-2 font-cond text-lg font-bold">Service history</h3>
              <DataTable rowKey={(j) => String(j.id)} rows={detail.jobs} empty="No service jobs yet." columns={[
                { key: "no", header: "Job", primary: true, cell: (j) => j.jobNo },
                { key: "date", header: "Date", cell: (j) => new Date(j.createdAt).toLocaleDateString() },
                { key: "work", header: "Work", cell: (j) => j.workSummary },
                { key: "status", header: "Status", align: "right" as const, cell: (j) => j.status === "billed" ? <Badge variant="success">Billed</Badge> : <Badge>Open</Badge> },
              ]} />
            </div>

            {detail.preOrders.length > 0 && (
              <div>
                <h3 className="mb-2 font-cond text-lg font-bold">Pre-orders</h3>
                <DataTable rowKey={(p) => String(p.id)} rows={detail.preOrders} empty="" columns={[
                  { key: "no", header: "No", primary: true, cell: (p) => p.preOrderNo },
                  { key: "part", header: "Part", cell: (p) => p.partDescription },
                  { key: "promised", header: "Promised", cell: (p) => p.promisedDate },
                  { key: "status", header: "Status", align: "right" as const, cell: (p) => p.status.charAt(0).toUpperCase() + p.status.slice(1) },
                ]} />
              </div>
            )}
          </div>
        )}
      </Sheet>

      <StatementSheet customerId={showStatement ? customerId : null} onClose={() => { setShowStatement(false); onClose(); }} onBack={() => setShowStatement(false)} />
      <ReceivePaymentSheet customerId={showReceive ? customerId : null} balanceCents={detail?.balanceCents ?? 0}
        onClose={() => setShowReceive(false)}
        onReceived={() => { toast("Payment received"); setShowReceive(false); reload(); }} />
    </>
  );
}
