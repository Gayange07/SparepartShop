import * as React from "react";
import { LuPlus } from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Checkbox } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useCustomers, type Customer, type CustomerWithBalance } from "@/lib/customers";
import { CustomerDialog } from "@/pages/customers/customer-dialog";
import { CustomerHistorySheet, ReceivePaymentSheet } from "@/pages/customers/customer-history-sheet";
import { rs, centsToRupees } from "@/lib/utils";

export function CustomersPage({ isOwner }: { isOwner: boolean }) {
  const [query, setQuery] = React.useState("");
  const [owingOnly, setOwingOnly] = React.useState(false);
  const { customers, loading, reload } = useCustomers(query, owingOnly);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [viewingId, setViewingId] = React.useState<number | null>(null);
  const [paying, setPaying] = React.useState<CustomerWithBalance | null>(null);
  const toast = useToast();

  const totalOwed = customers.reduce((sum, c) => sum + Math.max(0, c.balanceCents), 0);

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3 max-md:mb-3">
        <h1 className="font-cond text-[28px] font-bold leading-tight max-md:hidden">Customers &amp; credit</h1>
        <Button className="max-md:w-full" onClick={() => setAdding(true)}><LuPlus />Add customer</Button>
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 pt-5 md:flex-row md:items-center md:justify-between">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or vehicle no…" className="md:max-w-sm" />
          <Checkbox label="Owes money only" checked={owingOnly} onChange={(e) => setOwingOnly(e.target.checked)} />
        </CardContent>
      </Card>

      <p className="mb-3 text-[12.5px] text-muted-foreground">{customers.length} customers · total owed <span className="font-semibold text-destructive">{rs(centsToRupees(totalOwed))}</span></p>

      <Card>
        <CardContent className="pt-5">
          <DataTable rowKey={(c) => String(c.id)} rows={customers} empty={loading ? "Loading…" : "No customers found."} columns={[
            { key: "name", header: "Name", primary: true, cell: (c) => c.name },
            { key: "phone", header: "Phone", cell: (c) => c.phone ? <a href={`tel:${c.phone}`} className="text-primary underline-offset-2 hover:underline">{c.phone}</a> : "—" },
            { key: "vehicle", header: "Vehicle", cell: (c) => <>{c.vehicleNo || "—"}{(c.manufacturer || c.model) && <div className="text-[12.5px] text-muted-foreground">{[c.manufacturer, c.model].filter(Boolean).join(" ")}</div>}</> },
            { key: "owes", header: "Owes", align: "right" as const, cell: (c) => <span className={c.balanceCents > 0 ? "font-semibold text-destructive" : ""}>{rs(centsToRupees(c.balanceCents))}</span> },
            {
              key: "a", header: "", actions: true, cell: (c: CustomerWithBalance) => (
                <>
                  {c.balanceCents > 0 && <Button size="sm" onClick={() => setPaying(c)}>Receive payment</Button>}
                  <Button size="sm" variant="outline" onClick={() => setViewingId(c.id)}>History</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>Edit</Button>
                </>
              ),
            },
          ]} />
        </CardContent>
      </Card>

      <CustomerDialog open={adding} onClose={() => setAdding(false)} isOwner={isOwner} customer={null}
        onSaved={() => { setAdding(false); toast("Customer added"); reload(); }} />
      <CustomerDialog open={!!editing} onClose={() => setEditing(null)} isOwner={isOwner} customer={editing}
        onSaved={() => { setEditing(null); toast("Customer updated"); reload(); }} />
      <CustomerHistorySheet customerId={viewingId} onClose={() => { setViewingId(null); reload(); }} />
      <ReceivePaymentSheet customerId={paying?.id ?? null} balanceCents={paying?.balanceCents ?? 0}
        onClose={() => setPaying(null)}
        onReceived={() => { toast(`Payment received from ${paying?.name ?? "customer"}`); setPaying(null); reload(); }} />
    </>
  );
}
