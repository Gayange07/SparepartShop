import * as React from "react";
import { LuEye, LuBan, LuPrinter } from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Checkbox } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useSalesHistory, fetchSale, voidSale, type SaleFilters, type SaleDetail } from "@/lib/sales";
import { rs, centsToRupees, cn } from "@/lib/utils";
import { colomboDate } from "@/lib/dates";

const PAY_LABEL: Record<string, string> = { cash: "Cash", card: "Card", credit: "Credit" };
const payLabel = (m: string) => PAY_LABEL[m] ?? m;

function ReceiptSheet({ saleId, onClose }: { saleId: number | null; onClose: () => void }) {
  const [detail, setDetail] = React.useState<SaleDetail | null>(null);

  React.useEffect(() => {
    if (!saleId) { setDetail(null); return; }
    fetchSale(saleId).then((r) => r.ok && setDetail(r.data));
  }, [saleId]);

  if (!saleId) return null;
  return (
    <Sheet open={!!saleId} onClose={onClose} title={detail ? `Bill ${detail.sale.invoiceNo}` : "Bill"}
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => window.print()}><LuPrinter />Print</Button></>}>
      {!detail ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-3">
          {detail.sale.status === "voided" && (
            <div className="rounded-md bg-destructive-soft px-3 py-2.5 text-sm text-destructive">
              Voided by {detail.voidedByName ?? "—"} on {new Date(detail.sale.voidedAt ?? "").toLocaleString()} — {detail.sale.voidReason}
            </div>
          )}
          <div className="text-sm text-muted-foreground">{new Date(detail.sale.createdAt).toLocaleString()} · Billed by {detail.sale.billedByName}</div>
          {detail.customer && <div className="text-sm">{detail.customer.name} <span className="text-muted-foreground">{detail.customer.phone}</span></div>}
          <ul className="divide-y divide-border-soft rounded-md border border-border">
            {detail.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div>{i.part.name} <span className="text-muted-foreground">({i.grade}) × {i.qty}</span>
                    {i.alreadyReturnedQty > 0 && <Badge variant="danger" className="ml-2">Returned × {i.alreadyReturnedQty}</Badge>}
                  </div>
                  {i.returnRefs.length > 0 && (
                    <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {i.returnRefs.map((r) => `${r.returnNo} (${r.qty} on ${r.createdAt.slice(0, 10)})`).join(", ")}
                    </div>
                  )}
                </div>
                <span className="tabular whitespace-nowrap">{rs(centsToRupees(i.qty * i.unitPriceCents))}</span>
              </li>
            ))}
            {detail.services.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{s.description}</span>
                <span className="tabular">{rs(centsToRupees(s.amountCents))}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{rs(centsToRupees(detail.sale.subtotalCents))}</span></div>
            {detail.sale.discountCents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount ({detail.sale.discountPct}%)</span><span className="tabular">-{rs(centsToRupees(detail.sale.discountCents))}</span></div>}
            <div className="flex justify-between border-t border-dashed border-[#C9D0CC] pt-1.5 font-cond text-xl font-bold"><span>Total</span><span className="tabular">{rs(centsToRupees(detail.sale.totalCents))}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Paid ({payLabel(detail.sale.paymentMethod)})</span><span className="tabular">{rs(centsToRupees(detail.sale.amountPaidCents))}</span></div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function VoidSheet({ saleId, invoiceNo, totalCents, onClose, onVoided }: {
  saleId: number | null; invoiceNo: string; totalCents: number; onClose: () => void; onVoided: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (saleId) { setReason(""); setPassword(""); setErr(""); } }, [saleId]);

  if (!saleId) return null;
  const submit = async () => {
    if (!reason.trim()) return setErr("Enter a reason");
    if (!password) return setErr("Enter the authorization password");
    setBusy(true);
    const res = await voidSale(saleId, reason.trim(), password);
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not void the bill");
    onVoided();
  };

  return (
    <Sheet open={!!saleId} onClose={onClose} title={`Void ${invoiceNo} — ${rs(centsToRupees(totalCents))}`}
      description="Cancels the bill and returns the items to stock. Needs the Owner Authorization Password."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" onClick={submit} disabled={busy}>{busy ? "Voiding…" : "Void bill"}</Button></>}>
      <div className="space-y-3">
        <div><Label>Reason *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this bill being voided?" autoFocus /></div>
        <div><Label>Owner authorization password *</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••" /></div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}

export function SalesHistoryPage({ isOwner }: { isOwner: boolean }) {
  const [filters, setFilters] = React.useState<SaleFilters>(() => ({ from: colomboDate(), to: colomboDate(), q: "", discountedOnly: false }));
  const { sales, loading, reload } = useSalesHistory(filters);
  const [viewing, setViewing] = React.useState<number | null>(null);
  const [voiding, setVoiding] = React.useState<{ id: number; invoiceNo: string; totalCents: number } | null>(null);
  const toast = useToast();

  const totalCents = sales.filter((s) => s.status === "completed").reduce((sum, s) => sum + s.totalCents, 0);
  const voidedCount = sales.filter((s) => s.status === "voided").length;
  const byPay = (["cash", "card", "credit"] as const).map((m) => ({
    m, cents: sales.filter((s) => s.status === "completed" && s.paymentMethod === m).reduce((sum, s) => sum + s.totalCents, 0),
  })).filter((x) => x.cents > 0);

  const quick = [
    { label: "Today", from: colomboDate(), to: colomboDate() },
    { label: "Yesterday", from: colomboDate(1), to: colomboDate(1) },
    { label: "Last 7 days", from: colomboDate(6), to: colomboDate() },
    { label: "All dates", from: "", to: "" },
  ];

  return (
    <>
      <h1 className="mb-5 font-cond text-[28px] font-bold leading-tight max-md:mb-3 max-md:hidden">Sales history</h1>
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 pt-5 md:grid-cols-4">
          <div className="col-span-2 flex flex-wrap gap-2 md:col-span-4 max-md:grid max-md:grid-cols-2">
            {quick.map((r) => {
              const active = filters.from === r.from && filters.to === r.to;
              return (
                <Button key={r.label} size="sm" variant={active ? "default" : "outline"} aria-pressed={active}
                  onClick={() => setFilters((f) => ({ ...f, from: r.from, to: r.to }))}>{r.label}</Button>
              );
            })}
          </div>
          <div className="min-w-0"><Label>From</Label><Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} /></div>
          <div className="min-w-0"><Label>To</Label><Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} /></div>
          <div className="col-span-2"><Label>Search</Label><Input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Invoice, customer or vehicle no…" /></div>
          <div className="col-span-2 md:col-span-4">
            <Checkbox label="Discounted only" checked={filters.discountedOnly} onChange={(e) => setFilters((f) => ({ ...f, discountedOnly: e.target.checked }))} />
          </div>
        </CardContent>
      </Card>

      {!isOwner && <p className="mb-3 text-[12.5px] text-muted-foreground">Showing your own bills.</p>}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-cond text-xl font-bold tabular">{rs(centsToRupees(totalCents))}</span>
        <span className="text-[13px] text-muted-foreground">{sales.length} bill{sales.length === 1 ? "" : "s"}{voidedCount > 0 && <> · {voidedCount} voided</>}</span>
        {byPay.map((x) => (
          <span key={x.m} className={cn("text-[13px]", x.m === "credit" ? "text-destructive" : "text-muted-foreground")}>
            {payLabel(x.m)} <b className="tabular text-foreground">{rs(centsToRupees(x.cents))}</b>
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          <DataTable rowKey={(s) => String(s.id)} rows={sales} empty={loading ? "Loading…" : "No bills in this range."} columns={[
            { key: "inv", header: "Invoice", primary: true, cell: (s) => <>{s.invoiceNo}{s.status === "voided" && <Badge variant="danger" className="ml-2">Voided</Badge>}</> },
            { key: "date", header: "Date", cell: (s) => new Date(s.createdAt).toLocaleString() },
            { key: "by", header: "Billed by", cell: (s) => s.billedByName },
            { key: "cust", header: "Customer", cell: (s) => <>{s.customer?.name ?? "—"}{s.vehicleNo && <div className="text-[12.5px] text-muted-foreground">{s.vehicleNo}</div>}</> },
            { key: "pay", header: "Paid by", cell: (s) => payLabel(s.paymentMethod) },
            { key: "disc", header: "Discount", cell: (s) => s.discountPct > 0 ? <>{s.discountPct}%{s.autoDiscountApplied && <Badge variant="info" className="ml-1">auto</Badge>}</> : "—" },
            { key: "total", header: "Total", align: "right" as const, cell: (s) => rs(centsToRupees(s.totalCents)) },
            {
              key: "a", header: "", actions: true, cell: (s) => (
                <>
                  <Button size="sm" variant="outline" onClick={() => setViewing(s.id)}><LuEye />View</Button>
                  {s.status === "completed" && <Button size="sm" variant="outline" className="text-destructive" onClick={() => setVoiding({ id: s.id, invoiceNo: s.invoiceNo, totalCents: s.totalCents })}><LuBan />Void</Button>}
                </>
              ),
            },
          ]} />
        </CardContent>
      </Card>

      <ReceiptSheet saleId={viewing} onClose={() => setViewing(null)} />
      <VoidSheet saleId={voiding?.id ?? null} invoiceNo={voiding?.invoiceNo ?? ""} totalCents={voiding?.totalCents ?? 0}
        onClose={() => setVoiding(null)}
        onVoided={() => { toast("Bill voided — stock restored"); setVoiding(null); reload(); }} />
    </>
  );
}
