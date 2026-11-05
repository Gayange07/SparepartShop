import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { PreOrderInput } from "shared";
import { findCustomerIdByPhone } from "../customers/match.js";
import { db } from "../db/client.js";
import { preOrders, customers, parts } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";
import { nextSeq } from "../sequence.js";

function withCustomer(row: typeof preOrders.$inferSelect) {
  const customer = row.customerId ? db.select().from(customers).where(eq(customers.id, row.customerId)).get() : null;
  const part = row.partId ? db.select().from(parts).where(eq(parts.id, row.partId)).get() : null;
  return { ...row, customer, part };
}

export default async function preOrdersRoutes(app: FastifyInstance) {
  app.get("/api/preorders", { preHandler: app.requireAuth }, async (req) => {
    const { status } = req.query as { status?: "pending" | "arrived" | "delivered" | "cancelled" };
    let rows = db.select().from(preOrders).all();
    if (status) rows = rows.filter((p) => p.status === status);
    rows.sort((a, b) => a.promisedDate.localeCompare(b.promisedDate));
    return { preOrders: rows.map(withCustomer) };
  });

  app.post("/api/preorders", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = PreOrderInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const now = new Date().toISOString();

    const row = db.transaction((tx) => {
      let customerId = input.customerId ?? findCustomerIdByPhone(input.customerPhone);
      if (!customerId) {
        const [created] = tx.insert(customers).values({
          name: input.customerName.trim(), phone: input.customerPhone.trim(), vehicleNo: input.vehicle.trim(),
          createdAt: now,
        }).returning().all();
        customerId = created.id;
      }

      const preOrderNo = nextSeq("PRE", preOrders, undefined, tx);
      const [created] = tx.insert(preOrders).values({
        preOrderNo, customerId, partId: input.partId ?? null, grade: input.grade ?? null, qty: input.qty,
        partDescription: input.partDescription, vehicle: input.vehicle, orderDate: input.orderDate,
        promisedDate: input.promisedDate, note: input.note, advancePaidCents: input.advancePaidCents,
        status: "pending", recordedBy: user.id, createdAt: now,
      }).returning().all();
      return created;
    });

    logActivity({ userId: user.id, action: "preorder_created", entityType: "pre_order", entityId: row.id, details: { preOrderNo: row.preOrderNo, promisedDate: input.promisedDate } });
    reply.send(withCustomer(row));
  });

  app.put("/api/preorders/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const existing = db.select().from(preOrders).where(eq(preOrders.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Pre-order not found" });

    const parsed = PreOrderInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    db.update(preOrders).set({
      partId: input.partId ?? null, grade: input.grade ?? null, qty: input.qty,
      partDescription: input.partDescription, vehicle: input.vehicle, orderDate: input.orderDate,
      promisedDate: input.promisedDate, note: input.note, advancePaidCents: input.advancePaidCents,
    }).where(eq(preOrders.id, id)).run();

    logActivity({ userId: user.id, action: "preorder_edited", entityType: "pre_order", entityId: id, details: { preOrderNo: existing.preOrderNo } });
    reply.send(withCustomer(db.select().from(preOrders).where(eq(preOrders.id, id)).get()!));
  });

  app.post("/api/preorders/:id/status", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const parsed = z.object({ status: z.enum(["pending", "arrived", "delivered", "cancelled"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const existing = db.select().from(preOrders).where(eq(preOrders.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Pre-order not found" });

    db.update(preOrders).set({ status: parsed.data.status }).where(eq(preOrders.id, id)).run();
    logActivity({ userId: user.id, action: "preorder_status_changed", entityType: "pre_order", entityId: id, details: { preOrderNo: existing.preOrderNo, status: parsed.data.status } });
    reply.send({ ok: true });
  });
}
