import * as React from "react";
import type { SessionUser } from "shared";
import { AppShell, OWNER_ONLY_ROUTES, type Route } from "@/components/app-shell";
import { Toaster } from "@/components/ui/toast";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { PosPage } from "@/pages/pos";
import { InventoryPage } from "@/pages/inventory";
import { JobsPage } from "@/pages/jobs";
import { PreOrdersPage } from "@/pages/preorders";
import { CustomersPage } from "@/pages/customers";
import { SalesHistoryPage } from "@/pages/sales-history";
import { SuppliersPage } from "@/pages/suppliers";
import { StaffPage } from "@/pages/staff";
import { ReportsPage } from "@/pages/reports";
import { SettingsPage } from "@/pages/settings";
import { MissingPartsPage } from "@/pages/missing";
import { Placeholder, NotAllowed } from "@/pages/placeholder";
import { api, SESSION_EXPIRED } from "@/lib/api";
import { afterSheetHistory } from "@/components/ui/sheet";

const TITLES: Record<Route, string> = { dashboard: "Dashboard", pos: "New sale", jobs: "Service jobs", inventory: "Inventory", preorders: "Pre-orders", missing: "Missing parts", customers: "Customers & credit", sales: "Sales history", suppliers: "Suppliers", staff: "Staff & payroll", reports: "Reports", settings: "Settings" };

export function App() {
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [route, setRoute] = React.useState<Route>(() => {
    const r = location.hash.slice(1);
    return r in TITLES ? (r as Route) : "dashboard";
  });
  React.useEffect(() => {
    afterSheetHistory(() => { if (location.hash.slice(1) !== route) location.hash = route; });
  }, [route]);
  React.useEffect(() => {
    const onHash = () => { const r = location.hash.slice(1) as Route; if (r && r in TITLES) setRoute(r); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  React.useEffect(() => {
    api<{ user: SessionUser | null }>("/auth/me").then((res) => setUser(res.ok ? res.data.user : null)).finally(() => setChecked(true));
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  if (!checked) return null;
  if (!user) return <Toaster><LoginPage onLogin={setUser} /></Toaster>;

  const logout = async () => { await api("/auth/logout", { method: "POST" }); setUser(null); };
  const blocked = user.role !== "owner" && OWNER_ONLY_ROUTES.includes(route);
  const page = blocked ? <NotAllowed title={TITLES[route]} /> : {
    dashboard: <DashboardPage go={setRoute} />,
    pos: <PosPage user={user} />,
    inventory: <InventoryPage isOwner={user.role === "owner"} canStock={user.role === "owner" || user.canStock} canCost={user.role === "owner" || user.canCost} />,
    jobs: <JobsPage go={setRoute} />,
    preorders: <PreOrdersPage go={setRoute} />,
    customers: <CustomersPage isOwner={user.role === "owner"} />,
    sales: <SalesHistoryPage isOwner={user.role === "owner"} />,
    suppliers: <SuppliersPage />,
    staff: <StaffPage />,
    reports: <ReportsPage />,
    settings: <SettingsPage />,
    missing: <MissingPartsPage isOwner={user.role === "owner"} />,
  }[route as "dashboard"] ?? <Placeholder title={TITLES[route]} />;
  return (
    <Toaster>
      <AppShell route={route} go={setRoute} onLogout={logout} userName={user.name} userRole={user.role === "owner" ? "Owner" : "Shopkeeper"} isOwner={user.role === "owner"}>{page}</AppShell>
    </Toaster>
  );
}
