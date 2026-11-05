import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { CustomerInput, PaymentInput } from "shared";
import { db } from "../db/client.js";
import { customers, sales, saleItems, saleServices, parts, serviceJobs, jobServices, jobParts, preOrders, payments } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";
import { customerBalanceCents } from "./balance.js";
import { nextSeq } from "../sequence.js";

export default async function customersRoutes(app: FastifyInstance) {
  app.get("/api/customers", { preHandler: app.requireAuth }, async (req) => {
    const { q, owing } = req.query as { q?: string; owing?: string };
    let rows = db.select().from(customers).all();
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((c) => [c.name, c.phone, c.vehicleNo].join(" ").toLowerCase().includes(needle));
    }
    const withBalance = rows.map((c) => ({ ...c, balanceCents: customerBalanceCents(c.id) }));
    const filtered = owing === "1" ? withBalance.filter((c) => c.balanceCents > 0) : withBalance;
    filtered.sort((a, b) => b.balanceCents - a.balanceCents || a.name.localeCompare(b.name));
    return { customers: filtered.slice(0, 200) };
  });

  app.get("/api/customers/:id/balance", { preHandler: app.requireAuth }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    return { balanceCents: customerBalanceCents(id) };
  });

  app.get("/api/customers/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const customer = db.select().from(customers).where(eq(customers.id, id)).get();
    if (!customer) return reply.code(404).send({ error: "Customer not found" });

    const customerSales = db.select().from(sales).where(eq(sales.customerId, id)).all();
    const bought = customerSales.flatMap((s) => {
      const items = db.select().from(saleItems).where(eq(saleItems.saleId, s.id)).all().map((i) => ({
        saleId: s.id, invoiceNo: s.invoiceNo, date: s.createdAt, voided: s.status === "voided",
        item: db.select().from(parts).where(eq(parts.id, i.partId)).get()?.name ?? "",
        grade: i.grade, qty: i.qty, amountCents: i.qty * i.unitPriceCents,
      }));
      const services = db.select().from(saleServices).where(eq(saleServices.saleId, s.id)).all().map((v) => ({
        saleId: s.id, invoiceNo: s.invoiceNo, date: s.createdAt, voided: s.status === "voided",
        item: v.description, grade: null, qty: 1, amountCents: v.amountCents,
      }));
      return [...items, ...services];
    }).sort((a, b) => b.date.localeCompare(a.date));

    const jobs = db.select().from(serviceJobs).where(eq(serviceJobs.customerId, id)).all().map((j) => {
      const services = db.select().from(jobServices).where(eq(jobServices.jobId, j.id)).all();
      const jParts = db.select().from(jobParts).where(eq(jobParts.jobId, j.id)).all();
      return { ...j, workSummary: services.map((s) => s.name).join(", ") + (jParts.length ? ` +${jParts.length} parts` : "") };
    }).sort((a, b) => b.id - a.id);

    const customerPreOrders = db.select().from(preOrders).where(eq(preOrders.customerId, id)).all().sort((a, b) => b.id - a.id);

    const balanceCents = customerBalanceCents(id);
    const totalSpentCents = customerSales.filter((s) => s.status === "completed").reduce((sum, s) => sum + s.totalCents, 0);

    reply.send({
      customer, balanceCents, totalSpentCents,
      billsCount: customerSales.filter((s) => s.status === "completed").length,
      jobsCount: jobs.length,
      bought, jobs, preOrders: customerPreOrders,
    });
  });

  app.get("/api/customers/:id/statement", { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const customer = db.select().from(customers).where(eq(customers.id, id)).get();
    if (!customer) return reply.code(404).send({ error: "Customer not found" });

    const creditSales = db.select().from(sales)
      .where(and(eq(sales.customerId, id), eq(sales.paymentMethod, "credit"), eq(sales.status, "completed")))
      .all();
    const customerPayments = db.select().from(payments)
      .where(and(eq(payments.type, "customer_credit"), eq(payments.partyId, id)))
      .all();

    const rows = [
      ...creditSales.map((s) => ({
        date: s.createdAt, ref: s.invoiceNo,
        details: `Credit bill Rs. ${(s.totalCents / 100).toFixed(2)}, paid Rs. ${(s.amountPaidCents / 100).toFixed(2)}`,
        owedCents: s.totalCents - s.amountPaidCents, paidCents: 0,
      })),
      ...customerPayments.map((p) => ({
        date: p.createdAt, ref: p.paymentNo, details: `Payment — ${p.method}${p.note ? ` (${p.note})` : ""}`,
        owedCents: 0, paidCents: p.amountCents,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const ledger = rows.map((r) => {
      running += r.owedCents - r.paidCents;
      return { ...r, balanceCents: running };
    });

    reply.send({ customer, ledger });
  });

  app.post("/api/customers", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = CustomerInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const [row] = db.insert(customers).values({
      name: input.name, phone: input.phone, vehicleNo: input.vehicleNo,
      manufacturer: input.manufacturer, model: input.model, nic: input.nic, address: input.address,
      creditLimitCents: user.role === "owner" ? (input.creditLimitCents ?? 0) : 0,
      createdAt: new Date().toISOString(),
    }).returning().all();
    reply.send({ customer: row });
  });

  app.put("/api/customers/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const existing = db.select().from(customers).where(eq(customers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Customer not found" });

    const parsed = CustomerInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const [row] = db.update(customers).set({
      name: input.name, phone: input.phone, vehicleNo: input.vehicleNo,
      manufacturer: input.manufacturer, model: input.model, nic: input.nic, address: input.address,
      creditLimitCents: user.role === "owner" ? (input.creditLimitCents ?? existing.creditLimitCents) : existing.creditLimitCents,
    }).where(eq(customers.id, id)).returning().all();
    reply.send({ customer: row });
  });

  app.post("/api/customers/:id/payments", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const customer = db.select().from(customers).where(eq(customers.id, id)).get();
    if (!customer) return reply.code(404).send({ error: "Customer not found" });

    const parsed = PaymentInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const paymentNo = nextSeq("RCP", payments, eq(payments.type, "customer_credit"));
    const [row] = db.insert(payments).values({
      paymentNo, type: "customer_credit", partyId: id, amountCents: input.amountCents,
      method: input.method, note: input.note, createdBy: user.id, createdAt: new Date().toISOString(),
    }).returning().all();

    logActivity({ userId: user.id, action: "payment", entityType: "customer", entityId: id, details: { amountCents: input.amountCents, method: input.method } });
    reply.send({ payment: row, balanceCents: customerBalanceCents(id) });
  });
}
