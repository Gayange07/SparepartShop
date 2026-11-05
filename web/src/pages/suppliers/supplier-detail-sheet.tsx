import * as React from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table";
import { fetchSupplierDetail, fetchSupplierStatement, type SupplierDetail, type LedgerRow } from "@/lib/suppliers";
import { rs, centsToRupees } from "@/lib/utils";

function StatementSheet({ supplierId, supplierName, onClose, onBack }: {
  supplierId: number | null; supplierName: string; onClose: () => void; onBack: () => void;
}) {
  const [ledger, setLedger] = React.useState<LedgerRow[]>([]);

  React.useEffect(() => {
    if (!supplierId) return;
    fetchSupplierStatement(supplierId).then((r) => r.ok && setLedger(r.data.ledger));
  }, [supplierId]);

  if (!supplierId) return null;
  return (
    <Sheet open={!!supplierId} onClose={onClose} title={`Statement — ${supplierName}`}
      footer={<><Button variant="outline" onClick={onBack}>← Back</Button><Button variant="outline" onClick={onClose} className="md:ml-auto">Close</Button></>}>
      <DataTable rowKey={(r) => String(r.i)} rows={ledger.map((r, i) => ({ ...r, i }))} empty="No activity yet." columns={[
        { key: "date", header: "Date", cell: (r) => new Date(r.date).toLocaleDateString() },
        { key: "ref", header: "Ref", cell: (r) => r.ref || "—" },
        { key: "details", header: "Details", primary: true, cell: (r) => r.details },
        { key: "bill", header: "Bill +", align: "right" as const, cell: (r) => r.owedCents > 0 ? rs(centsToRupees(r.owedCents)) : "—" },
        { key: "paid", header: "Paid −", align: "right" as const, cell: (r) => r.paidCents > 0 ? rs(centsToRupees(r.paidCents)) : "—" },
        { key: "bal", header: "Balance", align: "right" as const, cell: (r) => rs(centsToRupees(r.balanceCents)) },
      ]} />
    </Sheet>
  );
}

export function SupplierDetailSheet({ supplierId, onClose, onPay, onReturn }: {
  supplierId: number | null; onClose: () => void; onPay: () => void; onReturn: () => void;
}) {
  const [detail, setDetail] = React.useState<SupplierDetail | null>(null);
  const [showStatement, setShowStatement] = React.useState(false);

  React.useEffect(() => {
    setDetail(null);
    if (!supplierId) return;
    fetchSupplierDetail(supplierId).then((r) => r.ok && setDetail(r.data));
  }, [supplierId]);

  if (!supplierId) return null;
  const s = detail?.supplier;
  const subtitle = s ? [s.rep, s.phone, s.address, s.termDays > 0 ? `${s.termDays} days credit` : "Cash", s.note].filter(Boolean).join(" · ") : "";

  return (
    <>
      <Sheet open={!showStatement} onClose={onClose} title={s?.name ?? "Supplier"} className="md:max-w-2xl"
        description={detail ? <>You owe <span className={detail.balanceCents > 0 ? "font-semibold text-destructive" : "font-semibold"}>{rs(centsToRupees(detail.balanceCents))}</span>{subtitle && <> · {subtitle}</>}</> : undefined}
        footer={<>
          <Button variant="outline" onClick={() => setShowStatement(true)}>Statement</Button>
          <Button variant="outline" onClick={onReturn}>Return to supplier</Button>
          {detail && detail.balanceCents > 0 && <Button onClick={onPay}>Pay</Button>}
          <Button variant="outline" onClick={onClose} className="md:ml-auto">Close</Button>
        </>}>
        {!detail ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-cond text-lg font-bold">Recent stock received</h3>
              <DataTable rowKey={(g) => String(g.id)} rows={detail.grns} empty="No GRNs yet." columns={[
                { key: "no", header: "GRN", primary: true, cell: (g) => g.grnNo },
                { key: "date", header: "Date", cell: (g) => g.billDate },
                { key: "bill", header: "Their bill", cell: (g) => g.theirBillNo || "—" },
                { key: "items", header: "Items", align: "right" as const, cell: (g) => g.itemCount },
                { key: "total", header: "Total", align: "right" as const, cell: (g) => rs(centsToRupees(g.totalCents)) },
                { key: "paid", header: "Paid", align: "right" as const, cell: (g) => rs(centsToRupees(g.paidNowCents)) },
              ]} />
            </div>
            {detail.partNumberMap.length > 0 && (
              <div>
                <h3 className="mb-2 font-cond text-lg font-bold">Their part numbers → our part numbers</h3>
                <DataTable rowKey={(m) => String(m.partId)} rows={detail.partNumberMap} empty="" columns={[
                  { key: "theirs", header: "Supplier part no", primary: true, cell: (m) => m.supplierPartNo },
                  { key: "ours", header: "Our part no", cell: (m) => m.partNo },
                  { key: "name", header: "Part name", cell: (m) => m.partName },
                ]} />
              </div>
            )}
          </div>
        )}
      </Sheet>
      <StatementSheet supplierId={showStatement ? supplierId : null} supplierName={s?.name ?? ""}
        onClose={() => { setShowStatement(false); onClose(); }} onBack={() => setShowStatement(false)} />
    </>
  );
}
