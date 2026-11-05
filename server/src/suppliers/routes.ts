import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { SupplierInput, GrnInput, SupplierPaymentInput, SupplierReturnInput } from "shared";
import { db } from "../db/client.js";
import { suppliers, grns, grnItems, payments, returns, parts, partGrades, partSupplierNumbers, stockMovements } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";
import { supplierBalanceCents } from "./balance.js";
import { nextSeq } from "../sequence.js";

export default async function suppliersRoutes(app: FastifyInstance) {
  app.get("/api/grns", { preHandler: app.requireAuth }, async () => {
    const rows = db.select().from(grns).all().sort((a, b) => b.id - a.id).slice(0, 15);
    const withDetail = rows.map((g) => {
      const supplier = db.select().from(suppliers).where(eq(suppliers.id, g.supplierId)).get();
      const items = db.select().from(grnItems).where(eq(grnItems.grnId, g.id)).all();
      const itemCount = items.reduce((sum, i) => sum + i.qty + i.freeQty, 0);
      return { ...g, supplierName: supplier?.name ?? "", itemCount };
    });
    return { grns: withDetail };
  });

  app.get("/api/suppliers", { preHandler: app.requireAuth }, async () => {
    const rows = db.select().from(suppliers).all();
    const withBalance = rows.map((s) => ({ ...s, balanceCents: supplierBalanceCents(s.id) }));
    withBalance.sort((a, b) => a.name.localeCompare(b.name));
    return { suppliers: withBalance };
  });

  app.get("/api/suppliers/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const supplier = db.select().from(suppliers).where(eq(suppliers.id, id)).get();
    if (!supplier) return reply.code(404).send({ error: "Supplier not found" });

    const supplierGrns = db.select().from(grns).where(eq(grns.supplierId, id)).all().sort((a, b) => b.id - a.id);
    const partNumberMap = db.select().from(partSupplierNumbers).where(eq(partSupplierNumbers.supplierId, id)).all().map((m) => ({
      ...m, partName: db.select().from(parts).where(eq(parts.id, m.partId)).get()?.name ?? "",
      partNo: db.select().from(parts).where(eq(parts.id, m.partId)).get()?.partNo ?? "",
    }));

    reply.send({ supplier, balanceCents: supplierBalanceCents(id), grns: supplierGrns, partNumberMap });
  });

  app.get("/api/suppliers/:id/statement", { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const supplier = db.select().from(suppliers).where(eq(suppliers.id, id)).get();
    if (!supplier) return reply.code(404).send({ error: "Supplier not found" });

    const supplierGrns = db.select().from(grns).where(eq(grns.supplierId, id)).all();
    const supplierPayments = db.select().from(payments).where(and(eq(payments.type, "supplier"), eq(payments.partyId, id))).all();
    const supplierReturns = db.select().from(returns).where(and(eq(returns.partyType, "supplier"), eq(returns.supplierId, id))).all();

    const rows = [
      ...supplierGrns.map((g) => ({
        date: g.createdAt, ref: g.grnNo,
        details: `Bill Rs. ${(g.totalCents / 100).toFixed(2)}, paid Rs. ${(g.paidNowCents / 100).toFixed(2)}${g.theirBillNo ? ` (their bill ${g.theirBillNo})` : ""}`,
        owedCents: g.totalCents - g.paidNowCents, paidCents: 0,
      })),
      ...supplierPayments.map((p) => ({
        date: p.createdAt, ref: p.paymentNo, details: `Payment — ${p.method}${p.note ? ` (${p.note})` : ""}`,
        owedCents: 0, paidCents: p.amountCents,
      })),
      ...supplierReturns.map((r) => ({
        date: r.createdAt, ref: r.returnNo, details: `Return — ${r.reason}`,
        owedCents: 0, paidCents: r.amountCents,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const ledger = rows.map((r) => { running += r.owedCents - r.paidCents; return { ...r, balanceCents: running }; });

    reply.send({ supplier, ledger });
  });

  app.post("/api/suppliers", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = SupplierInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

    const [row] = db.insert(suppliers).values({ ...parsed.data, createdAt: new Date().toISOString() }).returning().all();
    logActivity({ userId: user.id, action: "supplier_created", entityType: "supplier", entityId: row.id, details: { name: row.name } });
    reply.send({ supplier: row });
  });

  app.put("/api/suppliers/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.select().from(suppliers).where(eq(suppliers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Supplier not found" });

    const parsed = SupplierInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

    const [row] = db.update(suppliers).set(parsed.data).where(eq(suppliers.id, id)).returning().all();
    reply.send({ supplier: row });
  });

  app.post("/api/suppliers/:id/grn", { preHandler: app.requireAllPermissions(["stock", "cost"]) }, async (req, reply) => {
    const user = req.session.user!;
    const supplierId = Number((req.params as { id: string }).id);
    const supplier = db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
    if (!supplier) return reply.code(404).send({ error: "Supplier not found" });

    const parsed = GrnInput.safeParse({ ...(req.body as object), supplierId });
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    for (const line of input.lines) {
      const part = db.select().from(parts).where(eq(parts.id, line.partId)).get();
      if (!part) return reply.code(400).send({ error: `Part ${line.partId} not found` });

      if (line.supplierPartNo.trim()) {
        const clash = db.select().from(partSupplierNumbers)
          .where(and(eq(partSupplierNumbers.supplierId, supplierId), eq(partSupplierNumbers.supplierPartNo, line.supplierPartNo.trim())))
          .get();
        if (clash && clash.partId !== line.partId) {
          const clashPart = db.select().from(parts).where(eq(parts.id, clash.partId)).get();
          return reply.code(409).send({ error: `Supplier part number "${line.supplierPartNo.trim()}" is already used for ${clashPart?.partNo ?? "another part"} (${clashPart?.name ?? ""})` });
        }
      }
    }

    const subtotalCents = input.lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
    const totalCents = Math.max(0, subtotalCents - input.discountCents);
    const now = new Date().toISOString();

    const grn = db.transaction((tx) => {
      const grnNo = nextSeq("GRN", grns, undefined, tx);
      const [created] = tx.insert(grns).values({
        grnNo, supplierId, theirBillNo: input.theirBillNo, billDate: input.billDate,
        subtotalCents, discountCents: input.discountCents, totalCents, paidNowCents: input.paidNowCents,
        createdBy: user.id, createdAt: now,
      }).returning().all();

      for (const line of input.lines) {
        tx.insert(grnItems).values({
          grnId: created.id, partId: line.partId, grade: line.grade, qty: line.qty, freeQty: line.freeQty,
          unitCostCents: line.unitCostCents, newSellPriceCents: line.newSellPriceCents ?? null, supplierPartNo: line.supplierPartNo,
        }).run();

        const gradeRow = tx.select().from(partGrades).where(eq(partGrades.partId, line.partId)).all().find((g) => g.grade === line.grade);
        const totalReceived = line.qty + line.freeQty;
        if (gradeRow) {
          tx.update(partGrades).set({
            qty: gradeRow.qty + totalReceived, costCents: line.unitCostCents,
            priceCents: line.newSellPriceCents ?? gradeRow.priceCents,
          }).where(eq(partGrades.id, gradeRow.id)).run();
        } else {
          tx.insert(partGrades).values({
            partId: line.partId, grade: line.grade, costCents: line.unitCostCents,
            priceCents: line.newSellPriceCents ?? null, qty: totalReceived, reorderLevel: 5,
          }).run();
        }

        tx.insert(stockMovements).values({
          partId: line.partId, grade: line.grade, qtyDelta: totalReceived, reason: "grn",
          note: `${grnNo} from ${supplier.name}`, refType: "grn", refId: created.id, userId: user.id, createdAt: now,
        }).run();

        if (line.supplierPartNo.trim()) {
          const existingMap = tx.select().from(partSupplierNumbers)
            .where(and(eq(partSupplierNumbers.partId, line.partId), eq(partSupplierNumbers.supplierId, supplierId))).get();
          if (!existingMap) {
            tx.insert(partSupplierNumbers).values({ partId: line.partId, supplierId, supplierPartNo: line.supplierPartNo.trim() }).run();
          } else if (existingMap.supplierPartNo !== line.supplierPartNo.trim()) {
            tx.update(partSupplierNumbers).set({ supplierPartNo: line.supplierPartNo.trim() }).where(eq(partSupplierNumbers.id, existingMap.id)).run();
          }
        }
      }

      return created;
    });

    logActivity({ userId: user.id, action: "grn", entityType: "grn", entityId: grn.id, details: { grnNo: grn.grnNo, supplierId, totalCents } });
    reply.send({ grn, balanceCents: supplierBalanceCents(supplierId) });
  });

  app.post("/api/suppliers/:id/payments", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const supplier = db.select().from(suppliers).where(eq(suppliers.id, id)).get();
    if (!supplier) return reply.code(404).send({ error: "Supplier not found" });

    const parsed = SupplierPaymentInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const paymentNo = nextSeq("SPY", payments, eq(payments.type, "supplier"));
    const [row] = db.insert(payments).values({
      paymentNo, type: "supplier", partyId: id, amountCents: input.amountCents, method: input.method,
      chequeNo: input.chequeNo, chequeDate: input.chequeDate ?? null, note: input.note,
      createdBy: user.id, createdAt: new Date().toISOString(),
    }).returning().all();

    logActivity({ userId: user.id, action: "payment", entityType: "supplier", entityId: id, details: { amountCents: input.amountCents, method: input.method } });
    reply.send({ payment: row, balanceCents: supplierBalanceCents(id) });
  });

  app.post("/api/suppliers/:id/returns", { preHandler: app.requireAllPermissions(["stock", "cost"]) }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const supplier = db.select().from(suppliers).where(eq(suppliers.id, id)).get();
    if (!supplier) return reply.code(404).send({ error: "Supplier not found" });

    const parsed = SupplierReturnInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const part = db.select().from(parts).where(eq(parts.id, input.partId)).get();
    if (!part) return reply.code(400).send({ error: "Part not found" });
    const gradeRow = db.select().from(partGrades).where(eq(partGrades.partId, input.partId)).all().find((g) => g.grade === input.grade);
    if (!gradeRow) return reply.code(400).send({ error: `${part.name} (${input.grade}) is not carried` });
    if (input.qty > gradeRow.qty) return reply.code(400).send({ error: `Only ${gradeRow.qty} of ${part.name} (${input.grade}) in stock` });

    const now = new Date().toISOString();
    const amountCents = input.qty * input.unitCostCents;

    const returnRow = db.transaction((tx) => {
      const returnNo = nextSeq("RET", returns, undefined, tx);
      tx.update(partGrades).set({ qty: gradeRow.qty - input.qty }).where(eq(partGrades.id, gradeRow.id)).run();
      const [row] = tx.insert(returns).values({
        returnNo, partyType: "supplier", supplierId: id, partId: input.partId, grade: input.grade,
        qty: input.qty, amountCents, reason: input.reason, createdBy: user.id, createdAt: now,
      }).returning().all();
      tx.insert(stockMovements).values({
        partId: input.partId, grade: input.grade, qtyDelta: -input.qty, reason: "return",
        note: `Returned to supplier ${returnNo}`, refType: "return", refId: row.id, userId: user.id, createdAt: now,
      }).run();
      return row;
    });

    logActivity({ userId: user.id, action: "return", entityType: "supplier", entityId: id, details: { returnNo: returnRow.returnNo, amountCents } });
    reply.send({ ok: true, balanceCents: supplierBalanceCents(id) });
  });
}
