import * as React from "react";
import { LuSearch, LuMinus, LuPlus, LuX, LuPackageSearch, LuWrench, LuPrinter, LuCheck, LuRotateCcw } from "react-icons/lu";
import { computeBillTotals, GRADES, gradeLabel, type GradeKey, type SessionUser } from "shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Label, Checkbox } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { GradeButton } from "@/components/grade-button";
import { useParts, type Part } from "@/lib/parts";
import { useSettings } from "@/lib/settings";
import { useCart, useSessionState } from "@/lib/cart";
import { partMatches, searchWords } from "@/lib/part-search";
import { useReturnsCart } from "@/lib/returns-cart";
import { ReturnSheet } from "@/pages/pos/return-sheet";
import { useCustomerSearch, type Customer } from "@/lib/customers";
import { takePendingBill } from "@/lib/pending-bill";
import { ServiceChargeSheet, type ServiceCharge } from "@/pages/pos/service-charge-sheet";
import { api } from "@/lib/api";
import { cn, f2, rs, centsToRupees } from "@/lib/utils";

type Pay = "cash" | "card" | "credit";
type Mechanic = { id: number; name: string };
type CustomerHit = Customer & { balanceCents?: number };

export function PosPage({ user }: { user: SessionUser }) {
  const toast = useToast();
  const { parts, reload: reloadParts } = useParts();
  const { billSettings } = useSettings();
  const cart = useCart(parts);
  const returnsCart = useReturnsCart();
  const [returnSheet, setReturnSheet] = React.useState(false);
  const [pendingOwnerAuth, setPendingOwnerAuth] = React.useState<string | undefined>();
  const isOwner = user.role === "owner";

  const [q, setQ] = React.useState("");
  const [mfr, setMfr] = React.useState("");
  const [model, setModel] = React.useState("");
  const [cat, setCat] = React.useState("");
  const [pane, setPane] = React.useState<"parts" | "bill">("parts");
  const [manualPct, setManualPct] = useSessionState("pos.pct", "");
  const [auto, setAuto] = useSessionState("pos.auto", true);
  const [round, setRound] = useSessionState("pos.round", false);
  const [pay, setPay] = useSessionState<Pay>("pos.pay", "cash");
  const [cash, setCash] = React.useState("");

  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customer, setCustomer] = useSessionState<CustomerHit | null>("pos.customer", null);
  const [customerName, setCustomerName] = useSessionState("pos.customerName", "");
  const [customerPhone, setCustomerPhone] = useSessionState("pos.customerPhone", "");
  const [vehicleNo, setVehicleNo] = useSessionState("pos.vehicleNo", "");
  const customerResults = useCustomerSearch(customerQuery) as CustomerHit[];
  const [changingCreditCustomer, setChangingCreditCustomer] = React.useState(false);

  const [credit, setCredit] = React.useState(false);
  const [creditPaidNow, setCreditPaidNow] = React.useState("0");
  const [creditPassword, setCreditPassword] = React.useState("");
  const [creditErr, setCreditErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [missing, setMissing] = React.useState(false);
  const [missingForm, setMissingForm] = React.useState({ description: "", manufacturer: "", model: "", category: "", customerName: "", customerPhone: "" });
  const missingField = (k: keyof typeof missingForm) => ({ value: missingForm[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMissingForm((f) => ({ ...f, [k]: e.target.value })) });
  const [svcSheet, setSvcSheet] = React.useState(false);
  const [mechanics, setMechanics] = React.useState<Mechanic[]>([]);
  const [done, setDone] = React.useState<null | { invoiceNo: string; totalCents: number; change: number }>(null);

  const [jobId, setJobId] = useSessionState<number | undefined>("pos.jobId", undefined);
  const [preOrderId, setPreOrderId] = useSessionState<number | undefined>("pos.preOrderId", undefined);
  const [mechanicId, setMechanicId] = useSessionState<number | undefined>("pos.mechanicId", undefined);
  const [advancePaid, setAdvancePaid] = useSessionState("pos.advance", 0);
  const isDesktop = React.useMemo(() => window.matchMedia("(min-width: 768px)").matches, []);

  React.useEffect(() => {
    api<{ mechanics: Mechanic[] }>("/mechanics", { method: "GET" }).then((r) => r.ok && setMechanics(r.data.mechanics));
  }, []);

  // Pick up a job or pre-order sent here from another page. Services can be added regardless of
  // parts-loading; part lines need `parts` loaded so cart.add() can price them, so if the bill has
  // parts we hold the bill until parts arrive.
  const pendingBillRef = React.useRef<ReturnType<typeof takePendingBill> | undefined>(undefined);
  if (pendingBillRef.current === undefined) pendingBillRef.current = takePendingBill();
  React.useEffect(() => {
    const bill = pendingBillRef.current;
    if (!bill) return;
    if (bill.lines.length && !parts.length) return; // wait for parts to load
    pendingBillRef.current = null; // consume
    if (cart.lines.length || cart.services.length) toast("The bill you had open was cleared for this one");
    resetAll(); // a job / pre-order replaces whatever half-made bill was saved
    for (const line of bill.lines) {
      for (let i = 0; i < line.qty; i++) cart.add(line.partId, line.grade);
    }
    for (const svc of bill.services) cart.addService(svc);
    if (bill.customer) {
      const { id, name, phone } = bill.customer;
      if (id) setCustomer({ id, name, phone, vehicleNo: bill.vehicleNo ?? "", manufacturer: "", model: "", nic: "", address: "", creditLimitCents: 0 });
      else setCustomer(null);
      setCustomerName(name); setCustomerPhone(phone);
    }
    if (bill.vehicleNo) setVehicleNo(bill.vehicleNo);
    setJobId(bill.jobId);
    setPreOrderId(bill.preOrderId);
    setMechanicId(bill.mechanicId);
    setAdvancePaid(bill.advancePaidRupees ?? 0);
    setPane("bill");
  }, [parts.length]);

  const manufacturers = React.useMemo(() => [...new Set(parts.map((p) => p.manufacturer))].sort(), [parts]);
  const modelsFor = (m: string) => [...new Set(parts.filter((p) => !m || p.manufacturer === m).flatMap((p) => p.models))].sort();
  const categoriesFor = (m: string, mo: string) => [...new Set(parts.filter((p) => (!m || p.manufacturer === m) && (!mo || p.models.includes(mo))).map((p) => p.category))].sort();

  const results = React.useMemo(() => {
    if (!q && !mfr && !model && !cat) return [];
    const words = searchWords(q);
    return parts.filter((p) => {
      return partMatches(p, words) && (!mfr || p.manufacturer === mfr) && (!model || p.models.includes(model)) && (!cat || p.category === cat);
    });
  }, [q, mfr, model, cat, parts]);

  const addLine = (p: Part, g: GradeKey) => {
    cart.add(p.id, g);
    toast(`${p.name}, ${gradeLabel(g)} added`);
  };
  const onQty = (i: number, n: number) => cart.setQty(i, n, (max) => toast(`Only ${max} in stock`));

  // --- live preview math, same function the server uses authoritatively ---
  const lineTotalCents = Math.round(cart.lineTotalRupees * 100);
  const serviceTotalCents = Math.round(cart.serviceTotalRupees * 100);
  const typed = Math.max(0, parseFloat(manualPct) || 0);
  const totals = billSettings
    ? computeBillTotals(lineTotalCents, serviceTotalCents, billSettings, {
        discountPct: typed, autoDiscountAccepted: auto, roundOff: round, isOwner,
        advanceDeductedCents: Math.round(advancePaid * 100),
        returnCreditCents: returnsCart.returnCreditCents,
      })
    : null;
  const change = (parseFloat(cash) || 0) * 100 - (totals?.dueCents ?? 0);
  const itemCount = cart.itemCount + returnsCart.returns.length;

  const resetAll = () => {
    cart.clear(); returnsCart.clear(); setPendingOwnerAuth(undefined);
    setManualPct(""); setRound(false); setCash(""); setPay("cash");
    setCustomer(null); setCustomerName(""); setCustomerPhone(""); setVehicleNo(""); setCustomerQuery("");
    setDone(null); setCredit(false); setCreditPassword(""); setCreditPaidNow("0"); setCreditErr("");
    setJobId(undefined); setPreOrderId(undefined); setMechanicId(undefined); setAdvancePaid(0);
    setPane("parts");
  };

  const buildPayload = () => ({
    lines: cart.lines.map((l) => ({ partId: l.partId, grade: l.grade, qty: l.qty })),
    services: cart.services.map((s) => ({ description: s.description, amount: Math.round(s.amountRupees * 100), mechanicId: s.mechanicId })),
    returns: returnsCart.returns.map((r) => ({ saleId: r.saleId, partId: r.partId, grade: r.grade, qty: r.qty, reason: r.reason })),
    customerId: customer?.id,
    customerName: customer ? customer.name : customerName,
    customerPhone: customer ? customer.phone : customerPhone,
    vehicleNo,
    mechanicId,
    jobId,
    preOrderId,
    discountPct: typed,
    autoDiscountAccepted: auto,
    roundOff: round,
    paymentMethod: pay,
    cashReceivedCents: pay === "cash" && cash ? Math.round(parseFloat(cash) * 100) : undefined,
  });

  const submit = async (extra?: { creditPaidNowCents?: number; ownerAuthPassword?: string }) => {
    setBusy(true);
    const res = await api<{ sale?: { invoiceNo: string; totalCents: number } | null; change?: number; error?: string; returnNos?: string[] }>("/sales", {
      body: { ...buildPayload(), creditPaidNowCents: extra?.creditPaidNowCents ?? 0, ownerAuthPassword: extra?.ownerAuthPassword ?? pendingOwnerAuth },
    });
    setBusy(false);
    if (!res.ok) return { error: res.data.error ?? "Could not complete the sale" };
    reloadParts();
    if (res.data.sale) {
      setDone({ invoiceNo: res.data.sale.invoiceNo, totalCents: res.data.sale.totalCents, change: res.data.change ?? 0 });
    } else if (res.data.returnNos?.length) {
      // Pure refund: no sale, show refund receipt instead.
      setDone({ invoiceNo: res.data.returnNos.join(", "), totalCents: 0, change: res.data.change ?? 0 });
    }
    return { error: null };
  };

  const complete = async () => {
    if (!cart.lines.length && !cart.services.length && !returnsCart.returns.length) return;
    if (pay === "credit") { setCredit(true); return; }
    const { error } = await submit();
    if (error) toast(error);
  };

  const doCredit = async () => {
    setCreditErr("");
    if (!customer && !customerName.trim()) return setCreditErr("Enter the customer name for a credit sale");
    if (!creditPassword) return setCreditErr("Enter the authorization password");
    const { error } = await submit({ creditPaidNowCents: Math.round((parseFloat(creditPaidNow) || 0) * 100), ownerAuthPassword: creditPassword });
    if (error) return setCreditErr(error);
    setCredit(false);
  };

  const openMissing = () => {
    setMissingForm({
      description: q.trim(), manufacturer: mfr, model, category: cat,
      customerName: customer ? customer.name : customerName, customerPhone: customer ? customer.phone : customerPhone,
    });
    setMissing(true);
  };

  const pick = (c: CustomerHit) => {
    setCustomer(c); setCustomerName(c.name); setCustomerPhone(c.phone);
    if (c.vehicleNo) setVehicleNo(c.vehicleNo);
    setCustomerQuery(""); setChangingCreditCustomer(false);
  };

  const suggestions = customerQuery && customerResults.length > 0 && !customer && (
    <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card shadow-[0_8px_24px_rgba(28,33,36,.12)]">
      {customerResults.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => pick(c)} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-secondary">
            <span><b>{c.name}</b> <span className="text-muted-foreground">{c.phone}</span></span>
            {!!c.balanceCents && c.balanceCents > 0 && <span className="shrink-0 text-[12.5px] font-semibold text-destructive">Owes {rs(centsToRupees(c.balanceCents))}</span>}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <h1 className="mb-5 font-cond text-[28px] font-bold leading-tight max-md:hidden">New sale</h1>
      {jobId && <div className="mb-3 rounded-md bg-accent px-3.5 py-2.5 text-sm">Billing service job — stock will be deducted when this sale is completed.</div>}
      {preOrderId && <div className="mb-3 rounded-md bg-accent px-3.5 py-2.5 text-sm">Delivering a pre-order{advancePaid ? ` — the advance of ${rs(advancePaid)} will be deducted` : ""}.</div>}
      <Segmented className="mb-3 md:hidden" value={pane} onChange={setPane}
        options={[{ value: "parts", label: "Find parts" }, { value: "bill", label: `Bill${itemCount ? ` (${itemCount})` : ""}` }]} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px] max-md:pb-24">
        {/* ---------------- Find parts ---------------- */}
        <Card className={cn(pane !== "parts" && "max-md:hidden")}>
          <CardHeader className="max-md:hidden"><CardTitle>Find parts</CardTitle></CardHeader>
          <CardContent className="max-md:pt-4">
            <div className="relative">
              <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part name, our number or supplier number" className="pl-9" autoFocus={isDesktop} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 max-md:grid-cols-2">
              <Select value={mfr} onChange={(e) => { setMfr(e.target.value); setModel(""); setCat(""); }} aria-label="Manufacturer">
                <option value="">All makes</option>{manufacturers.map((m) => <option key={m}>{m}</option>)}
              </Select>
              <Select value={model} onChange={(e) => { setModel(e.target.value); setCat(""); }} aria-label="Model">
                <option value="">All models</option>{modelsFor(mfr).map((m) => <option key={m}>{m}</option>)}
              </Select>
              <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="max-md:col-span-2">
                <option value="">All categories</option>{categoriesFor(mfr, model).map((m) => <option key={m}>{m}</option>)}
              </Select>
            </div>

            <div className="mt-3">
              {!q && !mfr && !model && !cat && (
                <p className="py-4 text-sm text-muted-foreground">Type a name or part number, or choose <b>make, model and category</b> to see every part that fits.</p>
              )}
              {(q || mfr || model || cat) && !results.length && (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">No parts match.</p>
                  <Button variant="outline" className="mt-3" onClick={openMissing}><LuPackageSearch />Customer wants it: record as missing</Button>
                </div>
              )}
              <ul>
                {results.map((p) => (
                  <li key={p.id} className="flex items-center gap-4 border-b border-border-soft py-3 last:border-0 max-md:flex-col max-md:items-stretch max-md:gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px]"><span className="font-cond font-bold tabular">{p.partNo}</span>&ensp;{p.name}</div>
                      <div className="mt-0.5 text-[12.5px] text-muted-foreground">{p.manufacturer}, {p.models.join(", ")} / {p.category}{p.rack && <>&ensp;Rack {p.rack}</>}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {GRADES.filter((g) => p.grades[g.key]).map((g) => (
                        <GradeButton key={g.key} grade={g.key} stock={p.grades[g.key]!} inBill={cart.inCart(p.id, g.key)} onAdd={() => addLine(p, g.key)} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 flex gap-2 max-md:flex-col">
              <Button variant="outline" onClick={openMissing}><LuPackageSearch />Part not available</Button>
              <Button variant="outline" onClick={() => setSvcSheet(true)}><LuWrench />Add service charge</Button>
            </div>
          </CardContent>
        </Card>

        {/* ---------------- Bill ---------------- */}
        <div className={cn("space-y-4", pane !== "bill" && "max-md:hidden")}>
          <Card>
            <CardHeader><CardTitle>Bill</CardTitle><span className="text-xs text-muted-foreground">Billed by <b className="text-foreground">{user.name}</b></span></CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="mb-3 w-full" onClick={() => setReturnSheet(true)}><LuRotateCcw />Exchange or return items</Button>
              {returnsCart.returns.length > 0 && totals && (() => {
                const buyingCents = lineTotalCents + serviceTotalCents;
                const returningCents = totals.returnCreditCents;
                const pay = Math.max(0, totals.dueCents);
                const refund = totals.refundOutCents;
                return (
                  <div className="mb-3 rounded-md border border-dashed border-input bg-accent/40 px-3 py-2.5 text-sm">
                    <div className="font-cond text-base font-bold leading-tight">Exchange summary</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>Returning <b className="tabular text-destructive">{rs(centsToRupees(returningCents))}</b></span>
                      <span className="text-faint">·</span>
                      <span>Buying <b className="tabular">{rs(centsToRupees(buyingCents))}</b></span>
                      <span className="text-faint">→</span>
                      {refund > 0
                        ? <span>Refund <b className="tabular text-destructive">{rs(centsToRupees(refund))}</b> in cash</span>
                        : pay > 0
                          ? <span>Customer pays <b className="tabular">{rs(centsToRupees(pay))}</b></span>
                          : <span><b>Even swap — nothing changes hands.</b></span>}
                    </div>
                  </div>
                );
              })()}
              {!cart.lines.length && !cart.services.length && !returnsCart.returns.length && <p className="py-4 text-sm text-muted-foreground">No items yet. Find a part and tap a grade to add it.</p>}
              <ul className="border-t border-border-soft">
                {returnsCart.returns.map((r, i) => (
                  <li key={"ret" + i} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border-soft py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="leading-snug text-destructive">{r.partName} <Badge variant={r.grade}>{gradeLabel(r.grade)}</Badge> <Badge variant="danger">Return × {r.qty}</Badge></div>
                      <div className="text-[12.5px] text-muted-foreground">{r.partNo} · from bill {r.invoiceNo}{r.billAgedDays > 2 && <> · <span className="font-semibold text-destructive">{r.billAgedDays}d old</span></>}</div>
                    </div>
                    <div className="w-[84px] text-right font-cond text-base font-bold tabular text-destructive max-md:text-lg">− {f2(centsToRupees(r.qty * r.unitPriceCents))}</div>
                    <button aria-label={`Remove return of ${r.partName}`} onClick={() => returnsCart.removeAt(i)} className="-mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded text-faint hover:bg-destructive-soft hover:text-destructive"><LuX className="size-5" /></button>
                  </li>
                ))}
                {cart.lines.map((l, i) => {
                  const p = parts.find((x) => x.id === l.partId);
                  const price = p?.grades[l.grade]?.price;
                  if (!p || price === undefined) return null; // still loading, or grade no longer carried
                  return (
                    <li key={l.partId + l.grade} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border-soft py-2.5">
                      <div className="min-w-0 flex-1 max-md:basis-[calc(100%-44px)]">
                        <div className="leading-snug">{p.name} <Badge variant={l.grade}>{gradeLabel(l.grade)}</Badge></div>
                        <div className="text-[12.5px] text-muted-foreground">{p.partNo}, {f2(price)} each</div>
                      </div>
                      <div className="flex overflow-hidden rounded-md border border-input max-md:order-2">
                        <button aria-label="One less" onClick={() => onQty(i, l.qty - 1)} className="grid w-8 cursor-pointer place-items-center bg-secondary max-md:w-10"><LuMinus className="size-4" /></button>
                        <input aria-label="Quantity" inputMode="numeric" value={l.qty} onChange={(e) => onQty(i, parseInt(e.target.value) || 0)} className="h-8 w-10 border-0 text-center text-base tabular outline-none max-md:h-10 max-md:w-12" />
                        <button aria-label="One more" onClick={() => onQty(i, l.qty + 1)} className="grid w-8 cursor-pointer place-items-center bg-secondary max-md:w-10"><LuPlus className="size-4" /></button>
                      </div>
                      <div className="w-[84px] text-right font-cond text-base font-bold tabular max-md:order-3 max-md:ml-auto max-md:w-auto max-md:text-lg">{f2(l.qty * price)}</div>
                      <button aria-label={`Remove ${p.name}`} onClick={() => cart.removeLine(i)} className="-mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded text-faint hover:bg-destructive-soft hover:text-destructive max-md:order-1"><LuX className="size-5" /></button>
                    </li>
                  );
                })}
                {cart.services.map((s, i) => (
                  <li key={"svc" + i} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border-soft py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="leading-snug">{s.description} <Badge variant="info">Service</Badge></div>
                      {s.mechanicId && <div className="text-[12.5px] text-muted-foreground">{mechanics.find((m) => m.id === s.mechanicId)?.name}</div>}
                    </div>
                    <div className="w-[84px] text-right font-cond text-base font-bold tabular">{f2(s.amountRupees)}</div>
                    <button aria-label={`Remove ${s.description}`} onClick={() => cart.removeService(i)} className="-mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded text-faint hover:bg-destructive-soft hover:text-destructive"><LuX className="size-5" /></button>
                  </li>
                ))}
              </ul>

              {totals && (
                <dl className="mt-3 space-y-2 text-sm">
                  {cart.lines.length > 0 && (
                    <div className="flex justify-between text-muted-foreground"><dt>Parts ({cart.lines.reduce((s, l) => s + l.qty, 0)})</dt><dd className="tabular">{rs(centsToRupees(lineTotalCents))}</dd></div>
                  )}
                  {cart.services.length > 0 && (
                    <div className="flex justify-between text-muted-foreground"><dt>Service charges ({cart.services.length})</dt><dd className="tabular">{rs(centsToRupees(serviceTotalCents))}</dd></div>
                  )}
                  <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular">{rs(centsToRupees(totals.subtotalCents))}</dd></div>
                  {totals.autoEligible && billSettings && (
                    <div className="rounded-md bg-accent px-3 py-2">
                      <Checkbox checked={auto} onChange={(e) => setAuto(e.target.checked)} label={<span>Big bill discount {billSettings.autoDiscountPct}% <span className="text-muted-foreground">(bill over {rs(centsToRupees(billSettings.autoDiscountOverCents))})</span></span>} />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <dt>Discount % {!isOwner && billSettings && <span className="text-xs text-muted-foreground">(max {billSettings.maxDiscountPct}% for staff)</span>}</dt>
                    <dd><Input aria-label="Discount percent" className="w-24 text-right" inputMode="decimal" disabled={totals.autoDiscountApplied} value={totals.autoDiscountApplied ? String(totals.discountPct) : manualPct} onChange={(e) => setManualPct(e.target.value)} /></dd>
                  </div>
                  {totals.discountCapped && <p className="text-xs text-warning">Limited to {billSettings?.maxDiscountPct}%. Ask the owner for more.</p>}
                  <div className="flex justify-between"><dt>Discount</dt><dd className="tabular">{totals.discountCents ? "− " + rs(centsToRupees(totals.discountCents)) : "—"}</dd></div>
                  <div className="flex items-center justify-between">
                    <Checkbox checked={round} onChange={(e) => setRound(e.target.checked)} label={<span>Round off <span className="text-muted-foreground">(down to Rs. {billSettings ? centsToRupees(billSettings.roundToCents) : 10})</span></span>} />
                    <dd className="tabular text-muted-foreground">{round && totals.roundOffCents ? f2(centsToRupees(totals.roundOffCents)) : ""}</dd>
                  </div>
                  {totals.returnCreditCents > 0 && (
                    <div className="flex justify-between text-destructive"><dt>Return credit</dt><dd className="tabular">− {rs(centsToRupees(totals.returnCreditCents))}</dd></div>
                  )}
                  <div className={cn("flex items-baseline justify-between border-t border-dashed border-[#C9D0CC] pt-2.5 font-cond text-2xl font-bold", totals.refundOutCents > 0 && "text-destructive")}>
                    <dt>{totals.refundOutCents > 0 ? "Cash to refund" : "Total"}</dt>
                    <dd className="tabular">{rs(centsToRupees(totals.refundOutCents > 0 ? totals.refundOutCents : totals.dueCents))}</dd>
                  </div>
                </dl>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div><Label>Payment</Label><Select value={pay} onChange={(e) => setPay(e.target.value as Pay)}><option value="cash">Cash</option><option value="card">Card</option><option value="credit">Credit (owner password)</option></Select></div>
                {pay === "cash" && (totals?.dueCents ?? 0) > 0 && <div><Label>Cash received</Label><Input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} /></div>}
              </div>
              {pay === "cash" && cash && (totals?.dueCents ?? 0) > 0 && <div className="mt-2 flex justify-between text-sm"><span>Change to give</span><b className={cn("tabular", change < 0 && "text-destructive")}>{rs(centsToRupees(change))}</b></div>}
              <Button size="lg" className="mt-4 w-full max-md:hidden" disabled={(!cart.lines.length && !cart.services.length && !returnsCart.returns.length) || busy} onClick={complete}><LuCheck />{busy ? "Completing…" : totals && totals.refundOutCents > 0 && !cart.lines.length && !cart.services.length ? "Refund customer" : "Complete sale"}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Customer and vehicle</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <div className="relative col-span-2">
                <Label>Name</Label>
                <Input
                  value={customer ? customer.name : customerName}
                  onChange={(e) => { setCustomer(null); setCustomerName(e.target.value); setCustomerQuery(e.target.value); }}
                  placeholder="Type to find an existing customer"
                />
                {!credit && suggestions}
              </div>
              <div><Label>Phone</Label><Input type="tel" inputMode="tel" value={customer ? customer.phone : customerPhone} disabled={!!customer} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
              <div><Label>Vehicle no</Label><Input placeholder="BCD-1234" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} /></div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Phone: running bill with torn-receipt edge */}
      {itemCount > 0 && totals && (
        <div className="bottom-ui receipt-edge fixed inset-x-2.5 bottom-[calc(66px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-b-[14px] bg-card py-2.5 pr-3 pl-4 drop-shadow-[0_4px_14px_rgba(28,33,36,.16)] md:hidden">
          <div>
            <div className="text-xs text-muted-foreground">{itemCount} item{itemCount === 1 ? "" : "s"} on the bill</div>
            <div className={cn("font-cond text-[23px] font-bold leading-none tabular", totals.refundOutCents > 0 && "text-destructive")}>
              {totals.refundOutCents > 0 ? `− ${rs(centsToRupees(totals.refundOutCents))}` : rs(centsToRupees(totals.dueCents))}
            </div>
          </div>
          {pane === "parts"
            ? <Button size="lg" onClick={() => { setPane("bill"); window.scrollTo(0, 0); }}>Review bill</Button>
            : <Button size="lg" onClick={complete} disabled={busy}>{busy ? "Completing…" : "Complete sale"}</Button>}
        </div>
      )}

      <Sheet open={credit} onClose={() => setCredit(false)} title={`Credit sale, ${totals ? rs(centsToRupees(totals.dueCents)) : ""}`} description="Needs the owner authorization password."
        footer={<><Button variant="outline" onClick={() => setCredit(false)}>Cancel</Button><Button onClick={doCredit} disabled={busy}>{busy ? "Approving…" : "Approve and complete"}</Button></>}>
        <div className="space-y-3">
          <div className="relative">
            <Label>Customer</Label>
            {customer && !changingCreditCustomer ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {customer.phone}
                    {!!customer.balanceCents && customer.balanceCents > 0 && <> · <span className="font-semibold text-destructive">already owes {rs(centsToRupees(customer.balanceCents))}</span></>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setCustomer(null); setCustomerName(""); setCustomerPhone(""); setChangingCreditCustomer(true); }}>Change</Button>
              </div>
            ) : (
              <>
                <Input value={customerName} placeholder="Type to find the customer"
                  onChange={(e) => { setCustomer(null); setCustomerName(e.target.value); setCustomerQuery(e.target.value); }} />
                {credit && suggestions}
                {!customer && customerName.trim() && <p className="mt-1 text-[12.5px] text-muted-foreground">Not in the list? A new customer will be saved{customerPhone ? ` with phone ${customerPhone}` : ""}.</p>}
              </>
            )}
          </div>
          {!customer && (
            <div><Label>Phone</Label><Input type="tel" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Paid now (Rs.)</Label><Input value={creditPaidNow} onChange={(e) => setCreditPaidNow(e.target.value)} inputMode="decimal" /></div>
            <div><Label>Authorization password</Label><Input type="password" value={creditPassword} onChange={(e) => setCreditPassword(e.target.value)} placeholder="••••" /></div>
          </div>
          {creditErr && <p role="alert" className="text-sm font-medium text-destructive">{creditErr}</p>}
        </div>
      </Sheet>

      <Sheet open={missing} onClose={() => setMissing(false)} title="Customer wants a part we don't have"
        footer={<><Button variant="outline" onClick={() => setMissing(false)}>Cancel</Button><Button onClick={async () => {
          if (!missingForm.description.trim()) return toast("Describe the part");
          const res = await api<{ error?: string }>("/missing-parts", { body: { ...missingForm, description: missingForm.description.trim() } });
          if (!res.ok) return toast(res.data.error ?? "Could not save");
          toast("Saved to Missing parts list");
          setMissing(false);
        }}>Save</Button></>}>
        <div className="space-y-3">
          <div><Label>Part wanted *</Label><Input {...missingField("description")} placeholder="e.g. Engine guard" /></div>
          <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2">
            <div><Label>Manufacturer</Label><Input {...missingField("manufacturer")} /></div>
            <div><Label>Model</Label><Input {...missingField("model")} /></div>
            <div className="max-sm:col-span-2"><Label>Category</Label><Input {...missingField("category")} /></div>
            <div><Label>Customer name</Label><Input {...missingField("customerName")} /></div>
            <div><Label>Phone</Label><Input type="tel" inputMode="tel" {...missingField("customerPhone")} /></div>
          </div>
        </div>
      </Sheet>

      <ServiceChargeSheet open={svcSheet} onClose={() => setSvcSheet(false)} onAdd={(s: ServiceCharge) => {
        cart.addService(s);
        toast(`${s.description} added`);
      }} />

      <ReturnSheet open={returnSheet} onClose={() => setReturnSheet(false)} isOwner={isOwner}
        onConfirm={(queued, ownerAuth) => {
          for (const r of queued) returnsCart.add(r);
          if (ownerAuth) setPendingOwnerAuth(ownerAuth);
          setReturnSheet(false);
          toast(`${queued.length} return${queued.length === 1 ? "" : "s"} added to the bill`);
          setPane("bill");
        }} />

      <Sheet open={!!done} onClose={resetAll}
        title={done && done.totalCents === 0 ? "Refund completed" : "Sale completed"}
        description={done ? (done.totalCents === 0 ? `${done.invoiceNo} — Rs. ${(Math.abs(done.change) / 100).toFixed(2)} paid out` : `Invoice ${done.invoiceNo}, ${rs(centsToRupees(done.totalCents))}`) : ""}
        footer={<><Button variant="outline" onClick={resetAll}>New sale</Button><Button onClick={() => window.print()}><LuPrinter />Print receipt</Button></>}>
        <p className="text-sm text-muted-foreground">Tap Print receipt to print it at the counter, or New sale to start the next bill.</p>
      </Sheet>
    </>
  );
}
