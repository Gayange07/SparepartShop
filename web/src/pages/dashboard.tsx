import * as React from "react";
import {
  LuPlus, LuWrench, LuTrendingUp, LuPackageSearch,
  LuClock, LuChevronRight, LuArrowRight,
  LuPackage,
} from "react-icons/lu";
import { isPreOrderUrgent, daysUntil, type SessionUser } from "shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useParts, isLow, LOW_STOCK_FLAG } from "@/lib/parts";
import { usePreOrders } from "@/lib/preorders";
import { api } from "@/lib/api";
import { cn, rs, centsToRupees, short } from "@/lib/utils";
import { useNarrow } from "@/lib/use-narrow";
import type { Route } from "@/components/app-shell";

/* ─── Types ─────────────────────────────────────────────────────────────── */
type DashboardSummary = {
  scope: "shop" | "mine";
  todaySalesCents: number;
  todayPartsRevenueCents: number;
  todayServiceRevenueCents: number;
  todayProfitCents: number | null;
  todayBillsCount: number;
  customersOweCents: number | null;
  suppliersOweCents: number | null;
  openJobsCount: number;
  last7Days: { date: string; salesCents: number; partsRevenueCents: number; serviceRevenueCents: number; billsCount: number }[];
};

/* ─── Metric tile ────────────────────────────────────────────────────────── */
function Metric({
  label, value, sub, accent = "default", icon: Icon, onClick, locked,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  accent?: "default" | "primary" | "warn" | "danger";
  icon?: React.ElementType; onClick?: () => void; locked?: boolean;
}) {
  const accentMap = {
    default: "text-foreground",
    primary: "text-primary",
    warn: "text-warning",
    danger: "text-destructive",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "group flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-all",
        onClick && "cursor-pointer hover:border-primary/50 hover:shadow-sm active:scale-[.99]",
        !onClick && "cursor-default",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-3.5 text-faint shrink-0" />}
      </div>
      {locked ? (
        <span className="font-cond text-[22px] font-bold text-faint">—</span>
      ) : (
        <span className={cn("font-cond text-[24px] font-bold leading-none tabular break-words max-sm:text-[20px]", accentMap[accent])}>{value}</span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted-foreground leading-tight">{locked ? "Owner only" : sub}</span>
        {onClick && !locked && <LuChevronRight className="size-3.5 text-faint opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity shrink-0" />}
      </div>
    </button>
  );
}

/* ─── Revenue hero ────────────────────────────────────────────────────────── */
function RevenueHero({ summary, go }: { summary: DashboardSummary | null; go: (r: Route) => void }) {
  const total = summary?.todaySalesCents ?? 0;
  const parts = summary?.todayPartsRevenueCents ?? 0;
  const svc = summary?.todayServiceRevenueCents ?? 0;
  const partsRatio = total > 0 ? parts / total : 0;
  const svcRatio = total > 0 ? svc / total : 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* top band */}
      <div className="bg-primary px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col max-sm:gap-2">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-primary-foreground/70">{summary?.scope === "mine" ? "Your sales today" : "Today's revenue"}</p>
            <p className="mt-0.5 font-cond text-[38px] max-sm:text-[32px] font-bold leading-none tabular text-primary-foreground">
              {summary ? rs(centsToRupees(total)) : "…"}
            </p>
            <p className="mt-1 text-[13px] text-primary-foreground/70">
              {summary ? `${summary.todayBillsCount} bill${summary.todayBillsCount === 1 ? "" : "s"} today` : ""}
            </p>
          </div>
          {summary?.todayProfitCents != null && (
            <div className="text-right max-sm:text-left">
              <p className="text-[12.5px] font-medium text-primary-foreground/70">Profit</p>
              <p className="mt-0.5 font-cond text-[22px] font-bold tabular text-primary-foreground">
                {rs(centsToRupees(summary.todayProfitCents))}
              </p>
            </div>
          )}
        </div>

        {/* parts / service progress bar */}
        {summary && total > 0 && (
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-primary-foreground/20">
              <div className="bg-primary-foreground/90 transition-all" style={{ width: `${partsRatio * 100}%` }} />
              <div className="bg-warning/70 transition-all" style={{ width: `${svcRatio * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-primary-foreground/70">
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-sm bg-primary-foreground/90" />
                Parts <b className="text-primary-foreground">{rs(centsToRupees(parts))}</b>
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-sm bg-warning/70" />
                Services <b className="text-primary-foreground">{rs(centsToRupees(svc))}</b>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* quick actions */}
      <div className="grid grid-cols-2 divide-x divide-border">
        <button onClick={() => go("pos")} className="flex min-h-11 items-center justify-center gap-2 py-3 text-[13.5px] font-medium text-foreground hover:bg-secondary transition-colors cursor-pointer">
          <LuPlus className="size-4 text-primary" />New sale
        </button>
        <button onClick={() => go("jobs")} className="flex min-h-11 items-center justify-center gap-2 py-3 text-[13.5px] font-medium text-foreground hover:bg-secondary transition-colors cursor-pointer">
          <LuWrench className="size-4 text-primary" />New job
        </button>
      </div>
    </div>
  );
}

/* ─── 7-day stacked bar chart ─────────────────────────────────────────────── */
function WeekChart({ days, go }: { days: DashboardSummary["last7Days"]; go: (r: Route) => void }) {
  const narrow = useNarrow();
  const W = narrow ? 340 : 520, H = narrow ? 170 : 140, L = narrow ? 36 : 40, B = 24, T = 8;
  const max = Math.max(...days.map((d) => d.salesCents), 1);
  const barW = (W - L - 4) / days.length;
  const pad = barW * 0.16;
  const plotH = H - B - T;
  const y0 = H - B;
  const dayLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleString("en", { weekday: "short" });
  const ticks = [0, max * 0.5, max];

  const weekParts = days.reduce((s, d) => s + d.partsRevenueCents, 0);
  const weekSvc = days.reduce((s, d) => s + d.serviceRevenueCents, 0);
  const weekTotal = days.reduce((s, d) => s + d.salesCents, 0);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-x-4 gap-y-1 max-sm:flex-col">
        <div>
          <p className="text-[12.5px] font-medium text-muted-foreground">Last 7 days</p>
          <p className="mt-0.5 font-cond text-[22px] font-bold tabular">{rs(centsToRupees(weekTotal))}</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-primary" />Parts {rs(centsToRupees(weekParts))}</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-warning" />Services {rs(centsToRupees(weekSvc))}</span>
        </div>
      </div>

      <figure>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sales last 7 days">
          {ticks.map((t) => {
            const y = T + plotH * (1 - t / max);
            return (
              <g key={t}>
                <line x1={L} x2={W} y1={y} y2={y} stroke="var(--color-border-soft)" strokeDasharray={t === 0 ? "0" : "2 4"} />
                <text x={L - 6} y={y + 4} textAnchor="end" fontSize={narrow ? 12 : 9.5} fill="var(--color-muted-foreground)">{short(t / 100)}</text>
              </g>
            );
          })}
          {days.map((d, i) => {
            const x = L + i * barW + pad;
            const bw = barW - pad * 2;
            const isToday = i === days.length - 1;
            const ph = (d.partsRevenueCents / max) * plotH;
            const sh = (d.serviceRevenueCents / max) * plotH;
            const partsH = Math.max(ph, d.partsRevenueCents > 0 ? 2 : 0);
            const svcH = Math.max(sh, d.serviceRevenueCents > 0 ? 2 : 0);
            return (
              <g key={d.date}>
                <title>
                  {dayLabel(d.date)}: {rs(centsToRupees(d.salesCents))} — Parts {rs(centsToRupees(d.partsRevenueCents))}, Services {rs(centsToRupees(d.serviceRevenueCents))} ({d.billsCount} bill{d.billsCount === 1 ? "" : "s"})
                </title>
                {partsH > 0 && (
                  <rect x={x} y={y0 - partsH} width={bw} height={partsH} rx="2.5" fill={isToday ? "#1B6B63" : "#9CCBC2"} />
                )}
                {svcH > 0 && (
                  <rect x={x} y={y0 - partsH - svcH} width={bw} height={svcH} rx="2.5" fill={isToday ? "#9A6A0E" : "#D4B483"} />
                )}
                {partsH === 0 && svcH === 0 && (
                  <rect x={x} y={y0 - 2} width={bw} height={2} rx="1" fill="var(--color-border)" />
                )}
                <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize={narrow ? 12 : 9.5}
                  fill={isToday ? "var(--color-primary)" : "var(--color-muted-foreground)"}
                  fontWeight={isToday ? "700" : "400"}>
                  {dayLabel(d.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </figure>

      <button onClick={() => go("reports")} className="mt-1 flex min-h-11 items-center gap-1 text-[13px] text-primary font-medium hover:underline cursor-pointer">
        Full reports <LuArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

/* ─── Alert row item ──────────────────────────────────────────────────────── */
function AlertRow({ icon: Icon, iconColor, label, right, onClick }: {
  icon: React.ElementType; iconColor: string; label: React.ReactNode;
  right?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors text-left",
        onClick ? "hover:bg-secondary cursor-pointer" : "cursor-default",
      )}
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", iconColor)}>
        <Icon className="size-3.5" />
      </span>
      <span className="flex-1 leading-snug">{label}</span>
      {right}
      {onClick && <LuChevronRight className="size-4 text-faint shrink-0" />}
    </button>
  );
}

/* ─── Pre-order due badge ─────────────────────────────────────────────────── */
function DueBadge({ promisedDate }: { promisedDate: string }) {
  const d = daysUntil(promisedDate);
  const text = d < 0 ? `${-d}d overdue` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days`;
  return <Badge variant={isPreOrderUrgent(promisedDate) ? "danger" : "success"} className="shrink-0">{text}</Badge>;
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export function DashboardPage({ go, user: propUser }: { go: (r: Route) => void; user?: SessionUser }) {
  const { parts } = useParts();
  const { preOrders } = usePreOrders("pending");
  const [missingCount, setMissingCount] = React.useState<number | null>(null);
  const openLowStock = () => { sessionStorage.setItem(LOW_STOCK_FLAG, "1"); go("inventory"); };
  const [user, setUser] = React.useState<SessionUser | null>(propUser ?? null);
  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);

  React.useEffect(() => {
    if (!propUser) {
      api<{ user: SessionUser | null }>("/auth/me", { method: "GET" })
        .then((r) => r.ok && setUser(r.data.user));
    }
    api<{ missingParts: unknown[] }>("/missing-parts?status=open", { method: "GET" })
      .then((r) => r.ok && setMissingCount(r.data.missingParts.length));
    api<DashboardSummary>("/dashboard/summary", { method: "GET" })
      .then((r) => r.ok && setSummary(r.data));
  }, [propUser]);

  const lowStockLines = parts.flatMap((p) =>
    (["GEN", "AA", "A"] as const).filter((g) => isLow(p.grades[g])).map((g) => ({ p, g }))
  );
  const dueSoon = preOrders.filter((p) => isPreOrderUrgent(p.promisedDate));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const hasAlerts = lowStockLines.length > 0 || dueSoon.length > 0 || (summary?.openJobsCount ?? 0) > 0 || (missingCount ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">

      {/* ── Greeting ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-cond text-[26px] font-bold leading-tight">
          {greeting}{user ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* ── Main grid: hero + chart side by side on wide ───────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">

        {/* Revenue hero */}
        <RevenueHero summary={summary} go={go} />

        {/* 7-day chart card */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          {summary?.last7Days ? (
            <WeekChart days={summary.last7Days} go={go} />
          ) : (
            <div className="flex h-full items-center justify-center py-12 text-sm text-muted-foreground">Loading chart…</div>
          )}
        </div>
      </div>

      {/* ── Secondary metrics row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

        <Metric
          label="Spare parts"
          value={summary ? rs(centsToRupees(summary.todayPartsRevenueCents)) : "…"}
          sub={summary ? `${summary.last7Days.at(-1)?.billsCount ?? 0} bill${(summary.last7Days.at(-1)?.billsCount ?? 0) === 1 ? "" : "s"} today` : ""}
          icon={LuPackage}
          accent="primary"
          onClick={() => go("inventory")}
        />

        <Metric
          label="Service charges"
          value={summary ? rs(centsToRupees(summary.todayServiceRevenueCents)) : "…"}
          sub={summary ? `${summary.openJobsCount} open job${summary.openJobsCount === 1 ? "" : "s"}` : ""}
          icon={LuWrench}
          accent={summary && summary.openJobsCount > 0 ? "warn" : "default"}
          onClick={() => go("jobs")}
        />

        <Metric
          label="Customers owe"
          value={summary?.customersOweCents != null ? rs(centsToRupees(summary.customersOweCents)) : ""}
          sub={summary?.customersOweCents != null ? (summary.customersOweCents > 0 ? "outstanding balance" : "all settled") : ""}
          accent={summary?.customersOweCents != null && summary.customersOweCents > 0 ? "danger" : "default"}
          locked={summary?.customersOweCents == null}
          onClick={summary?.customersOweCents != null ? () => go("customers") : undefined}
        />

        <Metric
          label="Suppliers owe"
          value={summary?.suppliersOweCents != null ? rs(centsToRupees(summary.suppliersOweCents)) : ""}
          sub={summary?.suppliersOweCents != null ? (summary.suppliersOweCents > 0 ? "unpaid bills" : "all paid") : ""}
          accent={summary?.suppliersOweCents != null && summary.suppliersOweCents > 0 ? "warn" : "default"}
          locked={summary?.suppliersOweCents == null}
          onClick={summary?.suppliersOweCents != null ? () => go("suppliers") : undefined}
        />
      </div>

      {/* ── Alerts + activity ─────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border-soft overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[13px] font-semibold text-muted-foreground">Needs attention</span>
            <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-[11.5px] font-semibold text-destructive">
              {[lowStockLines.length > 0, dueSoon.length > 0, (summary?.openJobsCount ?? 0) > 0, (missingCount ?? 0) > 0].filter(Boolean).length} items
            </span>
          </div>

          {summary && summary.openJobsCount > 0 && (
            <AlertRow
              icon={LuWrench}
              iconColor="bg-warning-soft text-warning"
              label={<><b>{summary.openJobsCount}</b> service job{summary.openJobsCount === 1 ? "" : "s"} waiting to be billed</>}
              onClick={() => go("jobs")}
            />
          )}

          {dueSoon.length > 0 && dueSoon.slice(0, 3).map((po) => (
            <AlertRow
              key={po.id}
              icon={LuClock}
              iconColor="bg-destructive-soft text-destructive"
              label={<><b>{po.customer?.name ?? "Customer"}</b> — {po.partDescription}</>}
              right={<DueBadge promisedDate={po.promisedDate} />}
              onClick={() => go("preorders")}
            />
          ))}
          {dueSoon.length > 3 && (
            <AlertRow
              icon={LuClock}
              iconColor="bg-destructive-soft text-destructive"
              label={<span className="text-muted-foreground">…and {dueSoon.length - 3} more pre-orders due</span>}
              onClick={() => go("preorders")}
            />
          )}

          {lowStockLines.length > 0 && (
            <AlertRow
              icon={LuPackageSearch}
              iconColor="bg-destructive-soft text-destructive"
              label={<><b>{lowStockLines.length}</b> part grade{lowStockLines.length === 1 ? "" : "s"} at or below reorder level</>}
              onClick={openLowStock}
            />
          )}

          {(missingCount ?? 0) > 0 && (
            <AlertRow
              icon={LuTrendingUp}
              iconColor="bg-aa-soft text-aa"
              label={<><b>{missingCount}</b> part{missingCount === 1 ? "" : "s"} asked for but not in stock</>}
              onClick={() => go("missing")}
            />
          )}
        </div>
      )}

      {/* ── Low stock mini-list ────────────────────────────────────────────── */}
      {lowStockLines.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-soft">
            <span className="text-[13px] font-semibold text-muted-foreground">Low stock</span>
            <button onClick={openLowStock} className="flex min-h-11 items-center gap-1 text-[13px] text-primary font-medium hover:underline cursor-pointer">
              View all <LuArrowRight className="size-3.5" />
            </button>
          </div>
          <ul className="divide-y divide-border-soft">
            {lowStockLines.slice(0, 6).map(({ p, g }) => (
              <li key={`${p.id}-${g}`} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 break-words">
                  <span className="font-cond font-bold text-[13.5px]">{p.partNo}</span>
                  <span className="ml-2 text-[13.5px]">{p.name}</span>
                  <Badge variant={g === "GEN" ? "GEN" : g === "AA" ? "AA" : "A"} className="ml-2">{g}</Badge>
                </div>
                <span className="font-cond font-bold tabular text-destructive shrink-0 ml-3">
                  {p.grades[g]?.qty ?? 0} left
                </span>
              </li>
            ))}
            {lowStockLines.length > 6 && (
              <li className="px-4 py-2.5 text-[13px] text-muted-foreground">
                …and {lowStockLines.length - 6} more grades below reorder level
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
