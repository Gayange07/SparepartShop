import * as React from "react";
import { LuHouse, LuReceipt, LuWrench, LuPackage, LuEllipsis, LuClock, LuPackageSearch, LuUsers, LuHistory, LuTruck, LuChartColumn, LuSettings, LuLogOut } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { useSettings } from "@/lib/settings";

export type Route = "dashboard" | "pos" | "jobs" | "inventory" | "preorders" | "missing" | "customers" | "sales" | "suppliers" | "staff" | "reports" | "settings";
type Item = { to: Route; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; group: string };

const NAV: Item[] = [
  { to: "dashboard", label: "Dashboard", icon: LuHouse, group: "Daily work" },
  { to: "pos", label: "New sale", icon: LuReceipt, group: "Daily work" },
  { to: "jobs", label: "Service jobs", icon: LuWrench, group: "Daily work" },
  { to: "preorders", label: "Pre-orders", icon: LuClock, group: "Daily work" },
  { to: "missing", label: "Missing parts", icon: LuPackageSearch, group: "Daily work" },
  { to: "inventory", label: "Inventory", icon: LuPackage, group: "Records" },
  { to: "customers", label: "Customers & credit", icon: LuUsers, group: "Records" },
  { to: "sales", label: "Sales history", icon: LuHistory, group: "Records" },
  { to: "suppliers", label: "Suppliers", icon: LuTruck, group: "Owner only" },
  { to: "staff", label: "Staff & payroll", icon: LuUsers, group: "Owner only" },
  { to: "reports", label: "Reports", icon: LuChartColumn, group: "Owner only" },
  { to: "settings", label: "Settings", icon: LuSettings, group: "Owner only" },
];
const TABS: Route[] = ["dashboard", "pos", "jobs", "inventory"];
const TAB_LABEL: Partial<Record<Route, string>> = { dashboard: "Home", pos: "Sell", jobs: "Jobs", inventory: "Stock" };
export const BUILT: Route[] = ["dashboard", "pos", "jobs", "inventory", "preorders", "missing", "customers", "sales", "suppliers", "staff", "reports", "settings"];
export const OWNER_ONLY_ROUTES: Route[] = NAV.filter((n) => n.group === "Owner only").map((n) => n.to);

const Count = ({ n, className }: { n?: number; className?: string }) =>
  n ? <span className={cn("min-w-[17px] rounded-full bg-destructive px-1.5 text-center text-[11px] font-bold leading-[17px] text-white", className)}>{n}</span> : null;

export function AppShell({ route, go, onLogout, children, userName, userRole, isOwner }: {
  route: Route; go: (r: Route) => void; onLogout: () => void; children: React.ReactNode; userName: string; userRole: string; isOwner: boolean;
}) {
  const [more, setMore] = React.useState(false);
  const shopName = useSettings().settings?.shopName ?? "";
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => { const f = () => setScrolled(window.scrollY > 4); window.addEventListener("scroll", f); return () => window.removeEventListener("scroll", f); }, []);
  const nav_ = isOwner ? NAV : NAV.filter((n) => n.group !== "Owner only");
  const current = nav_.find((n) => n.to === route) ?? nav_[0];
  const groups = [...new Set(nav_.map((n) => n.group))];
  const nav = (r: Route) => { setMore(false); go(r); window.scrollTo(0, 0); };

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col overflow-y-auto border-r border-border bg-[#FBFCFB] md:flex">
        <div className="px-5 pt-5 pb-3">
          <div className="font-cond text-xl font-bold leading-tight">{shopName}</div>
          <div className="mt-1 text-xs text-muted-foreground">Spare parts ERP</div>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="px-5 pt-4 pb-1 text-xs text-faint">{g}</div>
            {nav_.filter((n) => n.group === g).map((n) => (
              <button key={n.to} onClick={() => nav(n.to)}
                className={cn("mx-2.5 my-px flex w-[calc(100%-20px)] cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left text-[#3E464C] hover:bg-secondary",
                  route === n.to && "bg-accent font-semibold text-accent-foreground hover:bg-accent")}>
                <n.icon className="size-[19px]" /><span className="flex-1">{n.label}</span><Count n={n.badge} />
              </button>
            ))}
          </div>
        ))}
        <div className="mt-auto border-t border-border px-5 py-4 text-sm">
          <div className="font-semibold">{userName}</div><div className="text-muted-foreground">{userRole}</div>
          <button onClick={onLogout} className="mt-2 cursor-pointer text-sm text-primary underline underline-offset-2">Log out</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header className={cn("sticky top-0 z-30 flex items-center gap-3 border-b border-transparent bg-background/95 px-4 pt-3 pb-2.5 backdrop-blur md:hidden", scrolled && "border-border")}>
          <div className="min-w-0 flex-1">
            <div className="truncate font-cond text-[22px] font-bold leading-tight">{current.label}</div>
            <div className="truncate text-xs text-muted-foreground">{shopName}</div>
          </div>
          <button onClick={() => setMore(true)} aria-label="Menu" className="grid size-11 cursor-pointer place-items-center rounded-full bg-accent font-bold text-accent-foreground">{userName.charAt(0).toUpperCase()}</button>
        </header>

        <main className="w-full max-w-[1400px] flex-1 px-7 py-6 max-md:px-3.5 max-md:pt-1 max-md:pb-[calc(90px+env(safe-area-inset-bottom))]">{children}</main>
      </div>

      {/* Phone tab bar */}
      <nav className="bottom-ui fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {[...TABS.map((t) => NAV.find((n) => n.to === t)!), null].map((n) => {
          const active = n ? route === n.to : !TABS.includes(route);
          const Icon = n ? n.icon : LuEllipsis;
          return (
            <button key={n?.to ?? "more"} onClick={() => (n ? nav(n.to) : setMore(true))}
              className={cn("relative flex cursor-pointer flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] text-faint", active && "font-semibold text-primary")}>
              <Icon className={cn("size-[23px]", active && "[stroke-width:2.4]")} />
              {n ? TAB_LABEL[n.to] : "More"}
              <Count n={n?.badge} className="absolute top-1 left-[calc(50%+6px)] text-[10px] leading-[15px]" />
            </button>
          );
        })}
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title={userName} description={shopName ? `${userRole}, ${shopName}` : userRole}
        footer={<button onClick={() => setMore(false)} className="h-11 cursor-pointer rounded-md border border-input">Close</button>}>
        <div className="grid grid-cols-2 gap-2">
          {nav_.filter((n) => !TABS.includes(n.to)).map((n) => (
            <button key={n.to} onClick={() => nav(n.to)}
              className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-3 text-left font-medium", route === n.to && "border-primary bg-accent text-accent-foreground")}>
              <n.icon className="size-5 shrink-0" /><span className="flex-1 leading-tight">{n.label}</span><Count n={n.badge} />
            </button>
          ))}
          <button onClick={onLogout} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-3 font-medium"><LuLogOut className="size-5" />Log out</button>
        </div>
      </Sheet>
    </div>
  );
}
