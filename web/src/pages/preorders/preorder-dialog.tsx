import * as React from "react";
import { GRADES, type GradeKey, type PreOrderInput } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useParts } from "@/lib/parts";
import { useCustomerSearch } from "@/lib/customers";
import { partMatches, searchWords } from "@/lib/part-search";
import { api } from "@/lib/api";
import { f2 } from "@/lib/utils";
import type { PreOrder } from "@/lib/preorders";

type PickedCustomer = { id: number; name: string; phone: string };

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export function PreOrderDialog({ open, onClose, onSaved, preOrder }: { open: boolean; onClose: () => void; onSaved: () => void; preOrder: PreOrder | null }) {
  const { parts } = useParts();
  const [customer, setCustomer] = React.useState<PickedCustomer | null>(null);
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const customerResults = useCustomerSearch(customerQuery);
  const [vehicle, setVehicle] = React.useState("");
  const [partQuery, setPartQuery] = React.useState("");
  const [partId, setPartId] = React.useState<number | undefined>();
  const [grade, setGrade] = React.useState<GradeKey>("GEN");
  const [qty, setQty] = React.useState("1");
  const [description, setDescription] = React.useState("");
  const [advance, setAdvance] = React.useState("0");
  const [orderDate, setOrderDate] = React.useState(todayStr());
  const [promisedDate, setPromisedDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErr("");
    if (preOrder) {
      setCustomer(preOrder.customer ? { id: preOrder.customer.id, name: preOrder.customer.name, phone: preOrder.customer.phone } : null);
      setCustomerName(preOrder.customer?.name ?? "");
      setCustomerPhone(preOrder.customer?.phone ?? "");
      setVehicle(preOrder.vehicle);
      setPartId(preOrder.partId ?? undefined);
      setGrade(preOrder.grade ?? "GEN");
      setQty(String(preOrder.qty));
      setDescription(preOrder.partDescription);
      setAdvance(String(preOrder.advancePaidCents / 100));
      setOrderDate(preOrder.orderDate);
      setPromisedDate(preOrder.promisedDate);
      setNote(preOrder.note);
    } else {
      setCustomer(null); setCustomerName(""); setCustomerPhone(""); setCustomerQuery("");
      setVehicle(""); setPartQuery(""); setPartId(undefined); setGrade("GEN"); setQty("1");
      setDescription(""); setAdvance("0"); setOrderDate(todayStr()); setPromisedDate(""); setNote("");
    }
  }, [open, preOrder]);

  if (!open) return null;

  const partWords = searchWords(partQuery);
  const partResults = partWords.length ? parts.filter((p) => partMatches(p, partWords)).slice(0, 8) : [];
  const linked = parts.find((p) => p.id === partId);
  const carried = linked ? GRADES.filter((g) => linked.grades[g.key]) : [];
  const gradeOptions = carried.length ? carried : GRADES;

  const pickPart = (id: number) => {
    const p = parts.find((x) => x.id === id);
    if (!p) return;
    setPartId(id);
    const first = GRADES.find((g) => p.grades[g.key]);
    if (first) setGrade(first.key);
    setPartQuery("");
    if (!description) setDescription(`${p.name}${p.models.length ? ` (${p.models.join(", ")})` : ""}`);
  };

  const submit = async () => {
    const custName = customer ? customer.name : customerName;
    const custPhone = customer ? customer.phone : customerPhone;
    if (!custName.trim() || !custPhone.trim()) return setErr("Customer name and phone are required");
    if (!description.trim()) return setErr("Describe the part");
    if (!promisedDate) return setErr("Set the promised date");

    setBusy(true);
    const payload: PreOrderInput = {
      customerId: customer?.id,
      customerName: custName, customerPhone: custPhone, vehicle,
      partId, grade: partId ? grade : undefined, qty: Math.max(1, Math.floor(Number(qty)) || 1),
      partDescription: description.trim(), advancePaidCents: Math.round((Number(advance) || 0) * 100),
      orderDate, promisedDate, note,
    };
    const res = await api<{ error?: string }>(preOrder ? `/preorders/${preOrder.id}` : "/preorders", { method: preOrder ? "PUT" : "POST", body: payload });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={preOrder ? `Edit pre-order ${preOrder.preOrderNo}` : "New pre-order"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save pre-order"}</Button></>}>
      <div className="space-y-3">
        <div className="relative">
          <Label>Customer name *</Label>
          <Input value={customer ? customer.name : customerName} onChange={(e) => { setCustomer(null); setCustomerName(e.target.value); setCustomerQuery(e.target.value); }} />
          {customerQuery && customerResults.length > 0 && !customer && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-[0_8px_24px_rgba(28,33,36,.12)]">
              {customerResults.map((c) => (
                <li key={c.id}><button type="button" onClick={() => { setCustomer(c); setCustomerQuery(""); }} className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-secondary"><b>{c.name}</b> <span className="text-muted-foreground">{c.phone}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Phone *</Label><Input type="tel" inputMode="tel" value={customer ? customer.phone : customerPhone} disabled={!!customer} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
          <div><Label>Vehicle</Label><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></div>
        </div>

        <h3 className="font-cond text-lg font-bold">Part</h3>
        <div><Label>Our part (if it's in the list)</Label>
          <Input value={partQuery} onChange={(e) => { setPartQuery(e.target.value); setPartId(undefined); }} placeholder="optional — search part no / name" />
          {partResults.length > 0 && (
            <ul className="mt-1 rounded-md border border-border">
              {partResults.map((p) => (
                <li key={p.id}><button type="button" onClick={() => pickPart(p.id)} className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-secondary">{p.partNo} {p.name}</button></li>
              ))}
            </ul>
          )}
          {partId && <p className="mt-1 text-xs text-muted-foreground">Linked to {parts.find((p) => p.id === partId)?.partNo}</p>}
        </div>
        {partId && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Grade</Label><Select value={grade} onChange={(e) => setGrade(e.target.value as GradeKey)}>{gradeOptions.map((g) => {
              const s = linked?.grades[g.key];
              return <option key={g.key} value={g.key}>{g.label}{s ? ` · Rs. ${f2(s.price)} · ${s.qty} in stock` : ""}</option>;
            })}</Select></div>
            <div><Label>Qty</Label><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} /></div>
          </div>
        )}
        <div><Label>Part description *</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Engine guard for Pulsar 150" /></div>
        <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2 max-sm:[&>*:first-child]:col-span-2">
          <div><Label>Advance paid (Rs.)</Label><Input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} /></div>
          <div><Label>Order date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
          <div><Label>Promised date *</Label><Input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} /></div>
        </div>
        <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
      </div>
    </Sheet>
  );
}
