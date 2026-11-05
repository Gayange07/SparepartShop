import * as React from "react";
import { LuDownload } from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Pills } from "@/components/ui/segmented";
import { DataTable } from "@/components/ui/table";
import { SalesChart } from "@/components/sales-chart";
import {
  useReport, overviewCsvUrl,
  type DateRange, type OverviewReport, type StaffReportRow, type ServicesReport, type DiscountsReport,
  type StockAnalysisRow, type StockValueReport, type ToOrderReport,
} from "@/lib/reports";
import { rs, centsToRupees, cn } from "@/lib/utils";
import { colomboDate, colomboMonthStart } from "@/lib/dates";

type Tab = "overview" | "staff" | "services" | "discounts" | "stock-analysis" | "stock-value" | "to-order";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "staff", label: "Staff & mechanics" },
  { value: "services", label: "Services" },
  { value: "discounts", label: "Discounts" },
  { value: "stock-analysis", label: "Stock analysis" },
  { value: "stock-value", label: "Stock value" },
  { value: "to-order", label: "To order" },
];

const todayStr = () => colomboDate();
const daysAgoStr = (n: number) => colomboDate(n);
const monthStartStr = colomboMonthStart;

function Stat({ label, value, note, tone }: { label: string; value: string; note?: React.ReactNode; tone?: "good" | "bad" | "muted" }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 max-md:px-3.5 max-md:py-3">
      <div className="text-[12.5px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-cond text-[25px] font-bold leading-tight tabular break-words max-md:text-[21px] max-sm:text-[18px] ${tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : tone === "muted" ? "text-faint" : ""}`}>{value}</div>
      {note && <div className="text-[12.5px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function OverviewTab({ range }: { range: DateRange }) {
  const { data, loading } = useReport<OverviewReport>("/reports/overview", range);
  const [showNumbers, setShowNumbers] = React.useState(false);

  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;

  const chartData = data.dayByDay.map((d) => ({ date: new Date(d.date), sales: centsToRupees(d.salesCents), profit: centsToRupees(d.profitCents) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <Stat label="Total sales" value={rs(centsToRupees(data.totalSalesCents))} note={<>{data.billsCount} bills{data.voidedCount > 0 && <>, {data.voidedCount} voided</>}</>} />
        <Stat label="Gross profit" value={rs(centsToRupees(data.grossProfitCents))} note={<>Cost of parts: {rs(centsToRupees(data.costOfPartsSoldCents))}</>} tone="good" />
        <Stat label="Parts sold" value={String(data.partsSoldQty)} note={<>{data.servicesCount} services</>} />
        <Stat label="Discounts given" value={rs(centsToRupees(data.discountCents))} note={<>{data.discountedBillsCount} bills, avg {data.avgDiscountPct}%</>} />
        <Stat label="Credit collected" value={rs(centsToRupees(data.creditCollectedCents))} />
      </div>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-3 font-cond text-lg font-bold">Day by day</h3>
          {chartData.length > 0 ? <SalesChart data={chartData} /> : <p className="py-6 text-center text-sm text-muted-foreground">No sales in this range.</p>}
          <button type="button" onClick={() => setShowNumbers((v) => !v)} className="mt-2 cursor-pointer text-sm font-medium text-primary underline underline-offset-2">
            {showNumbers ? "Hide the numbers" : "Show the numbers"}
          </button>
          {showNumbers && (
            <div className="mt-3">
              <DataTable rowKey={(r) => r.date} rows={data.dayByDay} empty="" columns={[
                { key: "date", header: "Date", primary: true, cell: (r) => r.date },
                { key: "bills", header: "Bills", align: "right" as const, cell: (r) => r.bills },
                { key: "parts", header: "Parts", align: "right" as const, cell: (r) => r.parts },
                { key: "sales", header: "Sales", align: "right" as const, cell: (r) => rs(centsToRupees(r.salesCents)) },
                { key: "profit", header: "Profit", align: "right" as const, cell: (r) => rs(centsToRupees(r.profitCents)) },
              ]} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-5">
          <h3 className="mb-3 font-cond text-lg font-bold">By payment type</h3>
          <DataTable rowKey={(r) => r.method} rows={data.byPaymentType} empty="" columns={[
            { key: "method", header: "Type", primary: true, cell: (r) => r.method },
            { key: "bills", header: "Bills", align: "right" as const, cell: (r) => r.bills },
            { key: "amount", header: "Amount", align: "right" as const, cell: (r) => rs(centsToRupees(r.amountCents)) },
            { key: "credit", header: "Still on credit", align: "right" as const, cell: (r) => r.stillOnCreditCents > 0 ? rs(centsToRupees(r.stillOnCreditCents)) : "—" },
          ]} />
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <h3 className="mb-3 font-cond text-lg font-bold">By grade</h3>
          <DataTable rowKey={(r) => r.grade} rows={data.byGrade} empty="" columns={[
            { key: "grade", header: "Grade", primary: true, cell: (r) => <Badge variant={r.grade as "GEN" | "AA" | "A"}>{r.grade}</Badge> },
            { key: "qty", header: "Qty", align: "right" as const, cell: (r) => r.qty },
            { key: "sales", header: "Sales", align: "right" as const, cell: (r) => rs(centsToRupees(r.salesCents)) },
            { key: "profit", header: "Profit", align: "right" as const, cell: (r) => rs(centsToRupees(r.profitCents)) },
          ]} />
        </CardContent></Card>
      </div>

      <Card><CardContent className="pt-5">
        <h3 className="mb-3 font-cond text-lg font-bold">Top 15 parts</h3>
        <DataTable rowKey={(r) => String(r.partId)} rows={data.topParts} empty="No parts sold in this range." columns={[
          { key: "pn", header: "Part no", primary: true, cell: (r) => r.partNo },
          { key: "name", header: "Name", cell: (r) => r.name },
          { key: "qty", header: "Qty", align: "right" as const, cell: (r) => r.qty },
          { key: "sales", header: "Sales", align: "right" as const, cell: (r) => rs(centsToRupees(r.salesCents)) },
        ]} />
      </CardContent></Card>

      <div className="flex justify-end">
        <a href={overviewCsvUrl(range)} download className={cn(buttonVariants({ variant: "outline" }), "max-md:h-auto max-md:w-full max-md:whitespace-normal max-md:py-2.5")}>
          <LuDownload />Download sales for this period (Excel CSV)
        </a>
      </div>
    </div>
  );
}

function StaffTab({ range }: { range: DateRange }) {
  const { data, loading } = useReport<{ rows: StaffReportRow[] }>("/reports/staff", range);
  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  return (
    <>
      <Card><CardContent className="pt-5">
        <DataTable rowKey={(r) => `${r.staffType}-${r.staffId}`} rows={data.rows} empty="No staff yet." columns={[
          { key: "name", header: "Name", primary: true, cell: (r) => r.name },
          { key: "role", header: "Role", cell: (r) => r.role },
          { key: "bills", header: "Bills made", align: "right" as const, cell: (r) => r.billsMade },
          { key: "jobs", header: "Jobs done", align: "right" as const, cell: (r) => r.jobsDone },
          { key: "parts", header: "Parts sold", align: "right" as const, cell: (r) => r.partsSold },
          { key: "services", header: "Services", align: "right" as const, cell: (r) => r.servicesCount },
          { key: "sales", header: "Sales", align: "right" as const, cell: (r) => rs(centsToRupees(r.salesCents)) },
          { key: "disc", header: "Discount given", align: "right" as const, cell: (r) => r.discountCents > 0 ? rs(centsToRupees(r.discountCents)) : "—" },
          { key: "profit", header: "Profit", align: "right" as const, cell: (r) => rs(centsToRupees(r.profitCents)) },
          { key: "pct", header: "Comm %", align: "right" as const, cell: (r) => `${r.commissionPct}%` },
          { key: "comm", header: "Commission", align: "right" as const, cell: (r) => <b>{rs(centsToRupees(r.commissionCents))}</b> },
        ]} />
      </CardContent></Card>
      <p className="mt-3 text-[12.5px] text-muted-foreground">Commission here is for the selected dates. Target bonuses are worked out per month in Staff &amp; Payroll.</p>
    </>
  );
}

function ServicesTab({ range }: { range: DateRange }) {
  const { data, loading } = useReport<ServicesReport>("/reports/services", range);
  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <Stat label="Service bills" value={String(data.serviceBillsCount)} />
        <Stat label="Service charges" value={rs(centsToRupees(data.serviceChargesCents))} />
        <Stat label="Open jobs now" value={String(data.openJobsNow)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-5">
          <h3 className="mb-3 font-cond text-lg font-bold">By service type</h3>
          <DataTable rowKey={(r) => r.description} rows={data.byServiceType} empty="No services in this range." columns={[
            { key: "s", header: "Service", primary: true, cell: (r) => r.description },
            { key: "n", header: "Times", align: "right" as const, cell: (r) => r.count },
            { key: "a", header: "Amount", align: "right" as const, cell: (r) => rs(centsToRupees(r.amountCents)) },
          ]} />
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <h3 className="mb-3 font-cond text-lg font-bold">By mechanic</h3>
          <DataTable rowKey={(r) => String(r.mechanicId)} rows={data.byMechanic} empty="No mechanic work in this range." columns={[
            { key: "n", header: "Mechanic", primary: true, cell: (r) => r.name },
            { key: "j", header: "Jobs", align: "right" as const, cell: (r) => r.jobsCount },
            { key: "b", header: "Bill total", align: "right" as const, cell: (r) => rs(centsToRupees(r.billTotalCents)) },
            { key: "p", header: "Profit", align: "right" as const, cell: (r) => rs(centsToRupees(r.profitCents)) },
          ]} />
        </CardContent></Card>
      </div>
      <Card><CardContent className="pt-5">
        <h3 className="mb-3 font-cond text-lg font-bold">Service history</h3>
        <DataTable rowKey={(r) => String(r.saleId)} rows={data.history} empty="" columns={[
          { key: "inv", header: "Invoice", primary: true, cell: (r) => r.invoiceNo },
          { key: "d", header: "Date", cell: (r) => r.date.slice(0, 10) },
          { key: "s", header: "Services", cell: (r) => r.services },
          { key: "a", header: "Amount", align: "right" as const, cell: (r) => rs(centsToRupees(r.amountCents)) },
        ]} />
      </CardContent></Card>
    </div>
  );
}

function DiscountsTab({ range }: { range: DateRange }) {
  const { data, loading } = useReport<DiscountsReport>("/reports/discounts", range);
  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  const pct = data.totalBillsCount > 0 ? Math.round((data.discountedBillsCount / data.totalBillsCount) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Discounted bills" value={`${data.discountedBillsCount} (${pct}%)`} />
        <Stat label="Total discount" value={rs(centsToRupees(data.totalDiscountCents))} />
        <Stat label="Automatic" value={String(data.autoCount)} />
        <Stat label="Manual" value={String(data.manualCount)} />
      </div>
      <Card><CardContent className="pt-5">
        <h3 className="mb-3 font-cond text-lg font-bold">By staff member</h3>
        <DataTable rowKey={(r) => String(r.userId)} rows={data.byStaff} empty="" columns={[
          { key: "n", header: "Name", primary: true, cell: (r) => r.name },
          { key: "b", header: "Bills", align: "right" as const, cell: (r) => r.bills },
          { key: "d", header: "Discount given", align: "right" as const, cell: (r) => rs(centsToRupees(r.discountCents)) },
        ]} />
      </CardContent></Card>
      <Card><CardContent className="pt-5">
        <h3 className="mb-3 font-cond text-lg font-bold">Discounted bills history</h3>
        <DataTable rowKey={(r) => String(r.saleId)} rows={data.history} empty="" columns={[
          { key: "inv", header: "Invoice", primary: true, cell: (r) => r.invoiceNo },
          { key: "d", header: "Date", cell: (r) => r.date.slice(0, 10) },
          { key: "pct", header: "Discount %", align: "right" as const, cell: (r) => <>{r.discountPct}%{r.autoDiscountApplied && <Badge variant="info" className="ml-1">auto</Badge>}</> },
          { key: "da", header: "Discount", align: "right" as const, cell: (r) => rs(centsToRupees(r.discountCents)) },
          { key: "t", header: "Total", align: "right" as const, cell: (r) => rs(centsToRupees(r.totalCents)) },
        ]} />
      </CardContent></Card>
    </div>
  );
}

const STATUS_PILLS: Record<StockAnalysisRow["status"], { label: string; variant: "danger" | "warning" | "info" | "default" | "success" }> = {
  reorder: { label: "Reorder now", variant: "danger" },
  fast: { label: "Fast — keep more", variant: "warning" },
  not_selling: { label: "Not selling", variant: "default" },
  overstocked: { label: "Overstocked", variant: "info" },
  ok: { label: "OK", variant: "success" },
};

function StockAnalysisTab() {
  const { data, loading } = useReport<{ rows: StockAnalysisRow[] }>("/reports/stock-analysis", null);
  const [statusFilter, setStatusFilter] = React.useState<StockAnalysisRow["status"] | "all">("all");

  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  const filtered = statusFilter === "all" ? data.rows : data.rows.filter((r) => r.status === statusFilter);

  return (
    <>
      <p className="mb-3 text-sm">Which parts to stock more of, and which are overstocked.</p>
      <p className="mb-3 text-[12.5px] text-muted-foreground">Based on the last 90 days of sales. "Days of stock" = how long current stock will last at the current selling speed.</p>
      <Pills value={statusFilter} onChange={setStatusFilter} options={[
        { value: "all", label: `All (${data.rows.length})` },
        { value: "reorder", label: `Reorder now (${data.rows.filter((r) => r.status === "reorder").length})` },
        { value: "fast", label: `Fast (${data.rows.filter((r) => r.status === "fast").length})` },
        { value: "not_selling", label: `Not selling (${data.rows.filter((r) => r.status === "not_selling").length})` },
        { value: "overstocked", label: `Overstocked (${data.rows.filter((r) => r.status === "overstocked").length})` },
      ]} />
      <Card className="mt-3"><CardContent className="pt-5">
        <DataTable rowKey={(r) => `${r.partId}-${r.grade}`} rows={filtered} empty="Nothing here." columns={[
          { key: "pn", header: "Part no", primary: true, cell: (r) => r.partNo },
          { key: "name", header: "Name", cell: (r) => r.name },
          { key: "g", header: "Grade", cell: (r) => <Badge variant={r.grade as "GEN" | "AA" | "A"}>{r.grade}</Badge> },
          { key: "q", header: "In stock", align: "right" as const, cell: (r) => r.qty },
          { key: "s30", header: "Sold 30d", align: "right" as const, cell: (r) => r.sold30 },
          { key: "s90", header: "Sold 90d", align: "right" as const, cell: (r) => r.sold90 },
          { key: "days", header: "Days of stock", align: "right" as const, cell: (r) => r.daysOfStock === null ? "—" : r.daysOfStock > 999 ? "999+" : r.daysOfStock },
          { key: "st", header: "Status", align: "right" as const, cell: (r) => <Badge variant={STATUS_PILLS[r.status].variant}>{STATUS_PILLS[r.status].label}</Badge> },
        ]} />
      </CardContent></Card>
    </>
  );
}

function StockValueTab() {
  const { data, loading } = useReport<StockValueReport>("/reports/stock-value", null);
  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <h3 className="font-cond text-lg font-bold">Current stock value</h3>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Items in stock" value={String(data.itemsInStock)} />
        <Stat label="Value at cost" value={rs(centsToRupees(data.valueAtCostCents))} />
        <Stat label="Value at selling price" value={rs(centsToRupees(data.valueAtPriceCents))} />
        <Stat label="Possible profit" value={rs(centsToRupees(data.possibleProfitCents))} tone="good" />
      </div>
      <Card><CardContent className="pt-5">
        <DataTable rowKey={(r) => `${r.manufacturer}-${r.grade}`} rows={data.rows} empty="" columns={[
          { key: "m", header: "Manufacturer", primary: true, cell: (r) => r.manufacturer },
          { key: "g", header: "Grade", cell: (r) => <Badge variant={r.grade as "GEN" | "AA" | "A"}>{r.grade}</Badge> },
          { key: "n", header: "Items", align: "right" as const, cell: (r) => r.items },
          { key: "c", header: "Value at cost", align: "right" as const, cell: (r) => rs(centsToRupees(r.costCents)) },
          { key: "p", header: "Value at selling", align: "right" as const, cell: (r) => rs(centsToRupees(r.priceCents)) },
        ]} />
      </CardContent></Card>
    </div>
  );
}

function ToOrderTab() {
  const { data, loading } = useReport<ToOrderReport>("/reports/to-order", null);
  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <Card><CardContent className="pt-5">
        <h3 className="mb-3 font-cond text-lg font-bold">Low stock</h3>
        <DataTable rowKey={(r) => `${r.partId}-${r.grade}`} rows={data.lowStock} empty="Nothing low." columns={[
          { key: "pn", header: "Part no", primary: true, cell: (r) => r.partNo },
          { key: "n", header: "Name", cell: (r) => r.name },
          { key: "g", header: "Grade", cell: (r) => <Badge variant={r.grade as "GEN" | "AA" | "A"}>{r.grade}</Badge> },
          { key: "q", header: "In stock", align: "right" as const, cell: (r) => <span className="font-semibold text-destructive">{r.qty}</span> },
          { key: "r", header: "Reorder at", align: "right" as const, cell: (r) => r.reorderLevel },
        ]} />
      </CardContent></Card>
      <Card><CardContent className="pt-5">
        <h3 className="mb-3 font-cond text-lg font-bold">Missing parts customers asked for</h3>
        <DataTable rowKey={(r) => String(r.id)} rows={data.missing} empty="Nothing here." columns={[
          { key: "d", header: "Part", primary: true, cell: (r) => <>{r.description}{(r.manufacturer || r.model) && <div className="text-[12.5px] text-muted-foreground">{[r.manufacturer, r.model].filter(Boolean).join(" ")}</div>}</> },
          { key: "c", header: "Customer", cell: (r) => <>{r.customerName || "—"}{r.customerPhone && <div className="text-[12.5px] text-muted-foreground">{r.customerPhone}</div>}</> },
          { key: "when", header: "Asked", cell: (r) => r.createdAt.slice(0, 10) },
        ]} />
      </CardContent></Card>
      <Card><CardContent className="pt-5">
        <h3 className="mb-3 font-cond text-lg font-bold">Pre-orders still to get</h3>
        <DataTable rowKey={(r) => String(r.id)} rows={data.preOrdersToGet} empty="Nothing here." columns={[
          { key: "no", header: "No", primary: true, cell: (r) => r.preOrderNo },
          { key: "p", header: "Part", cell: (r) => r.partDescription },
          { key: "q", header: "Qty", align: "right" as const, cell: (r) => r.qty },
          { key: "pr", header: "Promised", align: "right" as const, cell: (r) => r.promisedDate },
        ]} />
      </CardContent></Card>
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [range, setRange] = React.useState<DateRange>({ from: monthStartStr(), to: todayStr() });

  const needsRange = tab !== "stock-analysis" && tab !== "stock-value" && tab !== "to-order";

  return (
    <>
      <h1 className="mb-5 font-cond text-[28px] font-bold leading-tight max-md:mb-3 max-md:hidden">Reports</h1>

      <Pills value={tab} onChange={setTab} options={TABS} />

      {needsRange && (
        <Card className="mt-4"><CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-wrap gap-2 max-md:grid max-md:w-full max-md:grid-cols-2">
            <Button size="sm" variant="outline" onClick={() => setRange({ from: todayStr(), to: todayStr() })}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => setRange({ from: daysAgoStr(6), to: todayStr() })}>7 days</Button>
            <Button size="sm" variant="outline" onClick={() => setRange({ from: daysAgoStr(29), to: todayStr() })}>30 days</Button>
            <Button size="sm" variant="outline" onClick={() => setRange({ from: monthStartStr(), to: todayStr() })}>This month</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 max-md:w-full">
            <div className="min-w-0"><Label>From</Label><Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
            <div className="min-w-0"><Label>To</Label><Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
          </div>
        </CardContent></Card>
      )}

      <div className="mt-4">
        {tab === "overview" && <OverviewTab range={range} />}
        {tab === "staff" && <StaffTab range={range} />}
        {tab === "services" && <ServicesTab range={range} />}
        {tab === "discounts" && <DiscountsTab range={range} />}
        {tab === "stock-analysis" && <StockAnalysisTab />}
        {tab === "stock-value" && <StockValueTab />}
        {tab === "to-order" && <ToOrderTab />}
      </div>
    </>
  );
}
