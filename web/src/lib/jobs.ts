import * as React from "react";
import type { GradeKey } from "shared";
import { api } from "@/lib/api";

export type JobLine = { id: number; partId: number; grade: GradeKey; qty: number; partNo: string; name: string };
export type JobServiceLine = { id: number; serviceListId: number | null; name: string; priceCents: number; qty: number };
export type JobCustomer = { id: number; name: string; phone: string } | null;
export type Mechanic = { id: number; name: string };

export type Job = {
  job: {
    id: number; jobNo: string; customerId: number | null; vehicleNo: string; model: string;
    mechanicId: number | null; note: string;
    status: "open" | "billed" | "cancelled";
    saleId: number | null;
    cancelledAt: string | null; cancelledBy: number | null; cancelReason: string | null;
    createdAt: string;
  };
  services: JobServiceLine[];
  parts: JobLine[];
  customer: JobCustomer;
  mechanic: Mechanic | null;
  estimateCents: number;
};

export function useJobs(status?: "open" | "billed" | "cancelled") {
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const res = await api<{ jobs: Job[] }>(`/jobs${status ? `?status=${status}` : ""}`, { method: "GET" });
    setJobs(res.ok ? res.data.jobs : []);
    setLoading(false);
  }, [status]);

  React.useEffect(() => { reload(); }, [reload]);

  return { jobs, loading, reload };
}

export type ServicePriceListItem = { id: number; name: string; priceCents: number; active: boolean };

export function useServicePriceList() {
  const [services, setServices] = React.useState<ServicePriceListItem[]>([]);
  const reload = React.useCallback(async () => {
    const res = await api<{ services: ServicePriceListItem[] }>("/service-price-list", { method: "GET" });
    if (res.ok) setServices(res.data.services);
  }, []);
  React.useEffect(() => { reload(); }, [reload]);
  return { services, reload };
}

export function useMechanics() {
  const [mechanics, setMechanics] = React.useState<Mechanic[]>([]);
  React.useEffect(() => {
    api<{ mechanics: Mechanic[] }>("/mechanics", { method: "GET" }).then((r) => r.ok && setMechanics(r.data.mechanics));
  }, []);
  return mechanics;
}
