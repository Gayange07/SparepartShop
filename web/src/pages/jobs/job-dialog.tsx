import * as React from "react";
import { GRADES, gradeLabel, type GradeKey, type JobInput } from "shared";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useParts } from "@/lib/parts";
import { partMatches, searchWords } from "@/lib/part-search";
import { useServicePriceList, useMechanics, type Job } from "@/lib/jobs";
import { useCustomerSearch } from "@/lib/customers";
import { api } from "@/lib/api";
import { f2 } from "@/lib/utils";

type ServiceLine = { serviceListId?: number; name: string; priceCents: number; qty: number };
type PartLine = { partId: number; grade: GradeKey; qty: number; partNo: string; name: string; priceCents: number };
type PickedCustomer = { id: number; name: string; phone: string; vehicleNo?: string; model?: string };

export function JobDialog({ open, onClose, onSaved, job }: { open: boolean; onClose: () => void; onSaved: () => void; job: Job | null }) {
  const { parts } = useParts();
  const { services: priceList } = useServicePriceList();
  const mechanics = useMechanics();

  const [customer, setCustomer] = React.useState<PickedCustomer | null>(null);
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const customerResults = useCustomerSearch(customerQuery);
  const [vehicleNo, setVehicleNo] = React.useState("");
  const [model, setModel] = React.useState("");
  const [mechanicId, setMechanicId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [serviceLines, setServiceLines] = React.useState<ServiceLine[]>([]);
  const [partLines, setPartLines] = React.useState<PartLine[]>([]);
  const [svcPick, setSvcPick] = React.useState("");
  const [partQuery, setPartQuery] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErr("");
    if (job) {
      setCustomer(job.customer);
      setCustomerName(job.customer?.name ?? "");
      setCustomerPhone(job.customer?.phone ?? "");
      setVehicleNo(job.job.vehicleNo);
      setModel(job.job.model);
      setMechanicId(job.job.mechanicId ? String(job.job.mechanicId) : "");
      setNote(job.job.note);
      setServiceLines(job.services.map((s) => ({ serviceListId: s.serviceListId ?? undefined, name: s.name, priceCents: s.priceCents, qty: s.qty })));
      setPartLines(job.parts.map((p) => {
        const part = parts.find((x) => x.id === p.partId);
        return { partId: p.partId, grade: p.grade, qty: p.qty, partNo: p.partNo, name: p.name, priceCents: Math.round((part?.grades[p.grade]?.price ?? 0) * 100) };
      }));
    } else {
      setCustomer(null); setCustomerName(""); setCustomerPhone(""); setCustomerQuery("");
      setVehicleNo(""); setModel(""); setMechanicId(""); setNote("");
      setServiceLines([]); setPartLines([]);
    }
  }, [open, job, parts]);

  if (!open) return null;

  const partWords = searchWords(partQuery);
  const partResults = partWords.length ? parts.filter((p) => partMatches(p, partWords)).slice(0, 8) : [];
  const usedQty = (partId: number, grade: GradeKey) => partLines.find((l) => l.partId === partId && l.grade === grade)?.qty ?? 0;

  const addService = () => {
    const svc = priceList.find((s) => s.id === Number(svcPick));
    if (!svc) return;
    setServiceLines((ls) => [...ls, { serviceListId: svc.id, name: svc.name, priceCents: svc.priceCents, qty: 1 }]);
  };

  const addPart = (partId: number, grade: GradeKey) => {
    const part = parts.find((p) => p.id === partId);
    if (!part) return;
    const stock = part.grades[grade];
    if (!stock) return;
    if (usedQty(partId, grade) + 1 > stock.qty) return setErr(`Only ${stock.qty} of ${part.name} ${gradeLabel(grade)} in stock`);
    setErr("");
    setPartLines((ls) => {
      const existing = ls.find((l) => l.partId === partId && l.grade === grade);
      if (existing) return ls.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { partId, grade, qty: 1, partNo: part.partNo, name: part.name, priceCents: Math.round(stock.price * 100) }];
    });
  };

  const servicesTotalCents = serviceLines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const partsTotalCents = partLines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const estimateCents = servicesTotalCents + partsTotalCents;

  const submit = async () => {
    if (!customer && !customerName.trim()) return setErr("Enter the customer name");
    if (!mechanicId) return setErr("Select the mechanic");
    if (!serviceLines.length && !partLines.length) return setErr("Add at least one service or part");

    setBusy(true);
    const payload: JobInput = {
      customerId: customer?.id,
      customerName: customer ? customer.name : customerName,
      customerPhone: customer ? customer.phone : customerPhone,
      vehicleNo, model, mechanicId: Number(mechanicId), note,
      services: serviceLines.map((s) => ({ serviceListId: s.serviceListId, name: s.name, priceCents: s.priceCents, qty: s.qty })),
      parts: partLines.map((p) => ({ partId: p.partId, grade: p.grade, qty: p.qty })),
    };
    const res = await api<{ error?: string }>(job ? `/jobs/${job.job.id}` : "/jobs", { method: job ? "PUT" : "POST", body: payload });
    setBusy(false);
    if (!res.ok) return setErr(res.data.error ?? "Could not save the job");
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title={job ? `Service job ${job.job.jobNo}` : "New service job"}
      className="md:max-w-3xl"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save job"}</Button></>}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="relative">
            <Label>Customer *</Label>
            <Input value={customer ? customer.name : customerName} onChange={(e) => { setCustomer(null); setCustomerName(e.target.value); setCustomerQuery(e.target.value); }} placeholder="Type to find an existing customer" />
            {customerQuery && customerResults.length > 0 && !customer && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-[0_8px_24px_rgba(28,33,36,.12)]">
                {customerResults.map((c) => (
                  <li key={c.id}><button type="button" onClick={() => { setCustomer(c); setVehicleNo(c.vehicleNo); setModel(c.model); setCustomerQuery(""); }} className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-secondary"><b>{c.name}</b> <span className="text-muted-foreground">{c.phone}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2 max-sm:[&>*:first-child]:col-span-2">
            <div><Label>Phone</Label><Input type="tel" inputMode="tel" value={customer ? customer.phone : customerPhone} disabled={!!customer} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
            <div><Label>Vehicle no</Label><Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} /></div>
            <div><Label>Model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
          </div>
          <div><Label>Mechanic *</Label>
            <Select value={mechanicId} onChange={(e) => setMechanicId(e.target.value)}>
              <option value="">— select mechanic —</option>
              {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          <div><Label>Complaint / notes</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>

          <dl className="space-y-1.5 border-t border-dashed border-[#C9D0CC] pt-2.5 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Service charges ({serviceLines.length})</dt>
              <dd className="tabular">{f2(servicesTotalCents / 100)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Parts ({partLines.reduce((s, l) => s + l.qty, 0)})</dt>
              <dd className="tabular">{f2(partsTotalCents / 100)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-dashed border-[#C9D0CC] pt-2 font-cond text-2xl font-bold">
              <dt>Estimate total</dt>
              <dd className="tabular">{f2(estimateCents / 100)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">Stock is deducted when the job is billed at the POS. Service prices come from the owner's price list.</p>
          {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
        </div>

        <div className="space-y-4 md:border-l md:border-border-soft md:pl-5">
          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="font-cond text-lg font-bold">Services</h3>
              {serviceLines.length > 0 && <span className="font-cond text-base font-bold tabular text-muted-foreground">{f2(servicesTotalCents / 100)}</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <Select value={svcPick} onChange={(e) => setSvcPick(e.target.value)} className="flex-1">
                <option value="">— choose a service —</option>
                {priceList.map((s) => <option key={s.id} value={s.id}>{s.name} — {f2(s.priceCents / 100)}</option>)}
              </Select>
              <Button variant="outline" onClick={addService}>Add</Button>
            </div>
            {serviceLines.map((s, i) => (
              <div key={i} className="mt-1 flex items-center justify-between text-sm">
                <span>{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className="tabular">{f2((s.priceCents * s.qty) / 100)}</span>
                  <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setServiceLines((ls) => ls.filter((_, j) => j !== i))} className="-mr-2 grid size-10 cursor-pointer place-items-center text-destructive">✕</button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="font-cond text-lg font-bold">Parts used</h3>
              {partLines.length > 0 && <span className="font-cond text-base font-bold tabular text-muted-foreground">{f2(partsTotalCents / 100)}</span>}
            </div>
            <Input className="mt-2" value={partQuery} onChange={(e) => setPartQuery(e.target.value)} placeholder="Search part no or name" />
            {partResults.length > 0 && (
              <ul className="mt-2 rounded-md border border-border">
                {partResults.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-2 last:border-0 max-sm:flex-col max-sm:items-stretch">
                    <span className="text-sm"><b className="font-cond tabular">{p.partNo}</b> {p.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {GRADES.filter((g) => p.grades[g.key]).map((g) => {
                        const s = p.grades[g.key]!;
                        const left = s.qty - usedQty(p.id, g.key);
                        return (
                          <Button key={g.key} size="sm" variant="outline" disabled={left <= 0} onClick={() => addPart(p.id, g.key)} className="h-auto flex-col items-start gap-0 py-1 leading-tight">
                            <span>{gradeLabel(g.key)} · {f2(s.price)}</span>
                            <span className="text-[11px] font-normal text-muted-foreground">{left > 0 ? `${left} left` : "Out of stock"}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {partLines.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{p.name} {gradeLabel(p.grade)} × {p.qty}</span>
                <div className="flex items-center gap-2">
                  <span className="tabular">{f2((p.priceCents * p.qty) / 100)}</span>
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPartLines((ls) => ls.filter((_, j) => j !== i))} className="-mr-2 grid size-10 cursor-pointer place-items-center text-destructive">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
