import * as React from "react";
import { LuPlus, LuTruck } from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useSuppliers, useRecentGrns, type Supplier, type SupplierWithBalance } from "@/lib/suppliers";
import { SupplierDialog } from "@/pages/suppliers/supplier-dialog";
import { GrnSheet } from "@/pages/suppliers/grn-sheet";
import { SupplierPaymentSheet } from "@/pages/suppliers/supplier-payment-sheet";
import { SupplierReturnSheet } from "@/pages/suppliers/supplier-return-sheet";
import { SupplierDetailSheet } from "@/pages/suppliers/supplier-detail-sheet";
import { rs, centsToRupees } from "@/lib/utils";

export function SuppliersPage() {
  const [query, setQuery] = React.useState("");
  const { suppliers, loading, reload } = useSuppliers(query);
  const recentGrns = useRecentGrns();
  const toast = useToast();

  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [receivingFor, setReceivingFor] = React.useState<SupplierWithBalance | null>(null);
  const [payingFor, setPayingFor] = React.useState<SupplierWithBalance | null>(null);
  const [returningFor, setReturningFor] = React.useState<SupplierWithBalance | null>(null);
  const [viewingId, setViewingId] = React.useState<number | null>(null);

  const totalOwed = suppliers.reduce((sum, s) => sum + Math.max(0, s.balanceCents), 0);

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 max-md:mb-3">
        <h1 className="font-cond text-[28px] font-bold leading-tight max-md:hidden">Suppliers</h1>
        <Button className="max-md:w-full" onClick={() => setAdding(true)}><LuPlus />Add supplier</Button>
      </div>

      <Card className="mb-4"><CardContent className="pt-5"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search supplier, rep or phone…" className="md:max-w-sm" /></CardContent></Card>

      <p className="mb-3 text-[12.5px] text-muted-foreground">{suppliers.length} suppliers · you owe <span className="font-semibold text-destructive">{rs(centsToRupees(totalOwed))}</span></p>

      <Card className="mb-4">
        <CardContent className="pt-5">
          <DataTable rowKey={(s) => String(s.id)} rows={suppliers} empty={loading ? "Loading…" : "No suppliers yet."} columns={[
            { key: "name", header: "Supplier", primary: true, cell: (s) => <>{s.name}{s.brands && <div className="text-[12.5px] text-muted-foreground">{s.brands}</div>}</> },
            { key: "rep", header: "Rep / phone", cell: (s) => <>{s.rep || "—"}{s.phone && <div className="text-[12.5px] text-muted-foreground">{s.phone}</div>}</> },
            { key: "grades", header: "Grades", cell: (s) => s.grades.length ? s.grades.map((g) => <Badge key={g} variant={g} className="mr-1">{g}</Badge>) : "—" },
            { key: "terms", header: "Terms", cell: (s) => s.termDays > 0 ? `${s.termDays} days` : "Cash" },
            { key: "owe", header: "You owe", align: "right" as const, cell: (s) => <span className={s.balanceCents > 0 ? "font-semibold text-destructive" : ""}>{rs(centsToRupees(s.balanceCents))}</span> },
            {
              key: "a", header: "", actions: true, cell: (s: SupplierWithBalance) => (
                <>
                  <Button size="sm" variant="outline" onClick={() => setViewingId(s.id)}>View</Button>
                  {s.balanceCents > 0 && <Button size="sm" variant="outline" onClick={() => setPayingFor(s)}>Pay</Button>}
                  <Button size="sm" onClick={() => setReceivingFor(s)}><LuTruck />Receive</Button>
                </>
              ),
            },
          ]} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="mb-3 font-cond text-lg font-bold">Recent stock received</h2>
          <DataTable rowKey={(g) => String(g.id)} rows={recentGrns} empty="No stock received yet." columns={[
            { key: "no", header: "GRN", primary: true, cell: (g) => g.grnNo },
            { key: "date", header: "Date", cell: (g) => g.billDate },
            { key: "supplier", header: "Supplier", cell: (g) => g.supplierName },
            { key: "bill", header: "Their bill", cell: (g) => g.theirBillNo || "—" },
            { key: "items", header: "Items", align: "right" as const, cell: (g) => g.itemCount },
            { key: "total", header: "Total", align: "right" as const, cell: (g) => rs(centsToRupees(g.totalCents)) },
          ]} />
        </CardContent>
      </Card>

      <SupplierDialog open={adding} onClose={() => setAdding(false)} supplier={null}
        onSaved={() => { setAdding(false); toast("Supplier added"); reload(); }} />
      <SupplierDialog open={!!editing} onClose={() => setEditing(null)} supplier={editing}
        onSaved={() => { setEditing(null); toast("Supplier updated"); reload(); }} />
      <GrnSheet open={!!receivingFor} onClose={() => setReceivingFor(null)} supplier={receivingFor}
        onSaved={() => { setReceivingFor(null); toast("Stock received"); reload(); }} />
      <SupplierPaymentSheet open={!!payingFor} onClose={() => setPayingFor(null)} supplier={payingFor} balanceCents={payingFor?.balanceCents ?? 0}
        onPaid={() => { setPayingFor(null); toast("Payment saved"); reload(); }} />
      <SupplierReturnSheet open={!!returningFor} onClose={() => setReturningFor(null)} supplier={returningFor}
        onReturned={() => { setReturningFor(null); toast("Return saved"); reload(); }} />
      <SupplierDetailSheet supplierId={viewingId} onClose={() => { setViewingId(null); reload(); }}
        onPay={() => { const s = suppliers.find((x) => x.id === viewingId); if (s) { setViewingId(null); setPayingFor(s); } }}
        onReturn={() => { const s = suppliers.find((x) => x.id === viewingId); if (s) { setViewingId(null); setReturningFor(s); } }} />
    </>
  );
}
