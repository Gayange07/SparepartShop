import * as React from "react";
import { LuSearch, LuRotateCcw, LuMinus, LuPlus } from "react-icons/lu";
import type { GradeKey } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useSalesHistory, fetchSale, type SaleListRow, type SaleDetail } from "@/lib/sales";
import type { QueuedReturn } from "@/lib/returns-cart";
import { rs, centsToRupees } from "@/lib/utils";

function daysBetween(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

type PickedItem = { partId: number; grade: GradeKey; qty: number; reason: string };

export function ReturnSheet({ open, onClose, isOwner, onConfirm }: {
  open: boolean; onClose: () => void; isOwner: boolean;
  onConfirm: (returns: QueuedReturn[], ownerAuthPassword?: string) => void;
}) {
  const [stage, setStage] = React.useState<"find" | "pick">("find");
  const [query, setQuery] = React.useState("");
  const { sales, loading } = useSalesHistory({ from: "", to: "", q: query, discountedOnly: false });
  const [picked, setPicked] = React.useState<SaleListRow | null>(null);
  const [detail, setDetail] = React.useState<SaleDetail | null>(null);
  const [items, setItems] = React.useState<Record<string, PickedItem>>({});
  const [reason, setReason] = React.useState("");
  const [ownerAuth, setOwnerAuth] = React.useState("");
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setStage("find"); setQuery(""); setPicked(null); setDetail(null); setItems({}); setReason(""); setOwnerAuth(""); setErr("");
  }, [open]);

  const openBill = async (s: SaleListRow) => {
    const res = await fetchSale(s.id);
    if (!res.ok) return setErr("Could not load that bill");
    setPicked(s); setDetail(res.data); setStage("pick");
  };

  const billAge = picked ? daysBetween(picked.createdAt) : 0;
  const billAged = billAge > 2;

  const setQty = (lineId: number, partId: number, grade: GradeKey, qty: number, available: number) => {
    const key = String(lineId);
    const clamped = Math.max(0, Math.min(qty, available));
    setItems((m) => {
      const copy = { ...m };
      if (clamped === 0) delete copy[key];
      else copy[key] = { partId, grade, qty: clamped, reason: m[key]?.reason ?? "" };
      return copy;
    });
  };

  const confirm = () => {
    const picks = Object.entries(items).filter(([, v]) => v.qty > 0);
    if (!picks.length) return setErr("Pick at least one item to return");
    if (billAged && !isOwner && !ownerAuth) return setErr("This bill is older than 2 days — owner password is needed");
    if (!detail || !picked) return;

    const queued: QueuedReturn[] = picks.map(([lineId, v]) => {
      const item = detail.items.find((i) => String(i.id) === lineId)!;
      return {
        saleId: picked.id, invoiceNo: picked.invoiceNo,
        partId: v.partId, partNo: item.part.partNo, partName: item.part.name,
        grade: v.grade, qty: v.qty, unitPriceCents: item.unitPriceCents,
        reason: reason.trim(), billAgedDays: billAge,
      };
    });

    onConfirm(queued, billAged && !isOwner ? ownerAuth : undefined);
  };

  const totalCreditCents = Object.entries(items).reduce((s, [lineId, v]) => {
    const item = detail?.items.find((i) => String(i.id) === lineId);
    return s + (item ? v.qty * item.unitPriceCents : 0);
  }, 0);

  return (
    <Sheet open={open} onClose={onClose}
      title={stage === "find" ? "Exchange or return items" : `Returning from ${picked?.invoiceNo ?? ""}`}
      description={stage === "find"
        ? "Find the earlier bill by invoice no, customer name or phone"
        : <>Bill from {picked ? new Date(picked.createdAt).toLocaleDateString() : ""} {billAged && <Badge variant="danger" className="ml-2">Older than 2 days</Badge>}</>}
      className="md:max-w-2xl"
      footer={stage === "find"
        ? <Button variant="outline" onClick={onClose} className="md:ml-auto">Cancel</Button>
        : <>
          <Button variant="outline" onClick={() => { setStage("find"); setPicked(null); setDetail(null); setItems({}); setErr(""); }}>← Back</Button>
          <Button onClick={confirm}><LuRotateCcw />Add to current sale {totalCreditCents > 0 && <>— {rs(centsToRupees(totalCreditCents))}</>}</Button>
        </>}>
      {stage === "find" ? (
        <div className="space-y-3">
          <div className="relative">
            <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invoice no, customer name or phone…" className="pl-9" autoFocus />
          </div>
          {loading && <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>}
          {!loading && query.trim() && sales.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No bills match "{query}".</p>}
          {sales.length > 0 && (
            <ul className="divide-y divide-border-soft rounded-md border border-border">
              {sales.slice(0, 20).map((s) => {
                const age = daysBetween(s.createdAt);
                const aged = age > 2;
                const voided = s.status === "voided";
                return (
                  <li key={s.id}>
                    <button type="button" disabled={voided}
                      onClick={() => openBill(s)}
                      className={`flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 ${aged ? "text-destructive" : ""}`}>
                      <div>
                        <div className="font-cond text-base font-bold">{s.invoiceNo}{voided && <Badge variant="danger" className="ml-2">Voided</Badge>}</div>
                        <div className="text-[12.5px] text-muted-foreground">{s.customer?.name ?? "Walk-in"} · {s.customer?.phone ?? "—"} · {new Date(s.createdAt).toLocaleDateString()}{aged && !voided && <> · <span className="font-semibold">older than 2 days</span></>}</div>
                      </div>
                      <div className="font-cond text-base font-bold tabular">{rs(centsToRupees(s.totalCents))}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
        </div>
      ) : detail && picked && (
        <div className="space-y-4">
          <div>
            <Label>Items on this bill</Label>
            <ul className="divide-y divide-border-soft rounded-md border border-border">
              {detail.items.map((i) => {
                const remaining = i.qty - i.alreadyReturnedQty;
                const picked = items[String(i.id)]?.qty ?? 0;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div>
                      <div className="font-cond text-[15px] font-bold">{i.part.partNo} <span className="font-normal">{i.part.name}</span> <Badge variant={i.grade}>{i.grade}</Badge></div>
                      <div className="text-[12.5px] text-muted-foreground">{rs(centsToRupees(i.unitPriceCents))} each · {remaining} left to return (bought {i.qty}{i.alreadyReturnedQty > 0 ? `, already returned ${i.alreadyReturnedQty}` : ""})</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" disabled={picked <= 0}
                        onClick={() => setQty(i.id, i.partId, i.grade, picked - 1, remaining)}><LuMinus /></Button>
                      <span className="w-6 text-center font-cond text-base font-bold tabular">{picked}</span>
                      <Button size="sm" variant="outline" disabled={picked >= remaining}
                        onClick={() => setQty(i.id, i.partId, i.grade, picked + 1, remaining)}><LuPlus /></Button>
                    </div>
                  </li>
                );
              })}
              {detail.items.length === 0 && <li className="px-3.5 py-3 text-sm text-muted-foreground">This bill has no part items (service-only bill — can't return items).</li>}
            </ul>
          </div>

          <div><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. customer changed mind, wrong part" /></div>

          {billAged && !isOwner && (
            <div><Label>Owner authorization password</Label><Input type="password" value={ownerAuth} onChange={(e) => setOwnerAuth(e.target.value)} placeholder="••••" /></div>
          )}

          {totalCreditCents > 0 && (
            <div className="rounded-md border border-dashed border-input px-3.5 py-2.5 text-sm">
              Return credit on this bill: <b className="tabular">{rs(centsToRupees(totalCreditCents))}</b>
            </div>
          )}

          {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
        </div>
      )}
    </Sheet>
  );
}
