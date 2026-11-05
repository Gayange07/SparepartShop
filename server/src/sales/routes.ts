import type { FastifyInstance } from "fastify";
import { verify } from "argon2";
import { eq, and } from "drizzle-orm";
import { SaleInput, VoidSaleInput, computeBillTotals, type BillSettings } from "shared";
import { findCustomerIdByPhone } from "../customers/match.js";
import { db } from "../db/client.js";
import { sales, saleItems, saleServices, parts, partGrades, stockMovements, customers, settings, serviceJobs, preOrders, users, returns, payments } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";
import { customerBalanceCents } from "../customers/balance.js";
import { nextSeq } from "../sequence.js";

const RETURN_AGE_LIMIT_MS = 2 * 24 * 60 * 60 * 1000;

class StockChangedError extends Error {
  constructor(public partId: number, public grade: string) {
    super(`Stock changed for part ${partId} (${grade})`);
  }
}

export default async function salesRoutes(app: FastifyInstance) {
  app.post("/api/sales", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = SaleInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const settingsRow = db.select().from(settings).get();
    if (!settingsRow) return reply.code(500).send({ error: "Shop settings not configured" });
    const billSettings: BillSettings = {
      maxDiscountPct: settingsRow.maxDiscountPct,
      autoDiscountOverCents: settingsRow.autoDiscountOverCents,
      autoDiscountPct: settingsRow.autoDiscountPct,
      roundToCents: settingsRow.roundToCents,
      roundDirection: settingsRow.roundDirection,
      taxPct: settingsRow.taxPct,
    };

    // Resolve every line's authoritative price/cost/stock from the DB — never trust client-sent prices.
    const resolvedLines: { partId: number; grade: "GEN" | "AA" | "A"; qty: number; unitPriceCents: number; unitCostCents: number; gradeRowId: number; availableQty: number }[] = [];
    for (const line of input.lines) {
      const part = db.select().from(parts).where(eq(parts.id, line.partId)).get();
      if (!part) return reply.code(400).send({ error: `Part ${line.partId} not found` });
      const gradeRow = db.select().from(partGrades).where(eq(partGrades.partId, line.partId)).all().find((g) => g.grade === line.grade);
      if (!gradeRow || gradeRow.priceCents === null) return reply.code(400).send({ error: `${part.name} (${line.grade}) is not carried` });
      if (line.qty > gradeRow.qty) return reply.code(400).send({ error: `Only ${gradeRow.qty} of ${part.name} (${line.grade}) in stock — check the quantity` });
      resolvedLines.push({
        partId: line.partId, grade: line.grade, qty: line.qty,
        unitPriceCents: gradeRow.priceCents, unitCostCents: gradeRow.costCents,
        gradeRowId: gradeRow.id, availableQty: gradeRow.qty,
      });
    }

    const lineTotalsCents = resolvedLines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
    const serviceTotalsCents = input.services.reduce((s, v) => s + v.amount, 0);

    let advanceDeductedCents = 0;
    if (input.preOrderId) {
      const preOrderRow = db.select().from(preOrders).where(eq(preOrders.id, input.preOrderId)).get();
      if (!preOrderRow) return reply.code(400).send({ error: "Pre-order not found" });
      if (preOrderRow.status === "delivered" || preOrderRow.status === "cancelled") {
        return reply.code(400).send({ error: `This pre-order is already ${preOrderRow.status}` });
      }
      advanceDeductedCents = preOrderRow.advancePaidCents;
    }
    if (input.jobId) {
      const jobRow = db.select().from(serviceJobs).where(eq(serviceJobs.id, input.jobId)).get();
      if (!jobRow) return reply.code(400).send({ error: "Service job not found" });
      if (jobRow.status !== "open") return reply.code(400).send({ error: `This service job is already ${jobRow.status}` });
    }

    const isOwner = user.role === "owner";

    // Resolve every return line: must belong to a completed sale, within age limit (owner override),
    // qty must not exceed what's left on that line after prior returns, and we re-price from sale_items — never trust client.
    type ResolvedReturn = { saleId: number; invoiceNo: string; partId: number; grade: "GEN" | "AA" | "A"; qty: number; unitPriceCents: number; reason: string };
    const resolvedReturns: ResolvedReturn[] = [];
    const now = new Date();
    let needsOwnerAuthForAgedReturn = false;

    for (const r of input.returns) {
      const originalSale = db.select().from(sales).where(eq(sales.id, r.saleId)).get();
      if (!originalSale) return reply.code(400).send({ error: `Bill ${r.saleId} not found` });
      if (originalSale.status === "voided") return reply.code(400).send({ error: `Bill ${originalSale.invoiceNo} is voided — cannot return against it` });

      const originalItem = db.select().from(saleItems)
        .where(and(eq(saleItems.saleId, r.saleId), eq(saleItems.partId, r.partId))).all()
        .find((i) => i.grade === r.grade);
      if (!originalItem) return reply.code(400).send({ error: `That item isn't on bill ${originalSale.invoiceNo}` });

      const alreadyReturned = db.select().from(returns)
        .where(and(eq(returns.saleId, r.saleId), eq(returns.partId, r.partId), eq(returns.grade, r.grade)))
        .all().reduce((s, row) => s + row.qty, 0);
      const remaining = originalItem.qty - alreadyReturned;
      if (r.qty > remaining) {
        return reply.code(400).send({ error: `Only ${remaining} left to return on bill ${originalSale.invoiceNo}` });
      }

      const ageMs = now.getTime() - new Date(originalSale.createdAt).getTime();
      if (ageMs > RETURN_AGE_LIMIT_MS) needsOwnerAuthForAgedReturn = true;

      resolvedReturns.push({
        saleId: r.saleId, invoiceNo: originalSale.invoiceNo, partId: r.partId, grade: r.grade,
        qty: r.qty, unitPriceCents: originalItem.unitPriceCents, reason: r.reason,
      });
    }

    // Age override: shopkeeper is blocked past 2 days; owner can override with the auth password.
    if (needsOwnerAuthForAgedReturn) {
      if (!isOwner) {
        if (!input.ownerAuthPassword) return reply.code(401).send({ error: "This bill is older than 2 days — owner authorization is needed" });
        const valid = await verify(settingsRow.ownerAuthPasswordHash, input.ownerAuthPassword);
        if (!valid) {
          logActivity({ userId: user.id, action: "owner_auth_failed", details: { context: "aged_return" } });
          return reply.code(401).send({ error: "Wrong authorization password" });
        }
      }
    }

    const returnCreditCents = resolvedReturns.reduce((s, r) => s + r.qty * r.unitPriceCents, 0);

    const totals = computeBillTotals(lineTotalsCents, serviceTotalsCents, billSettings, {
      discountPct: input.discountPct, autoDiscountAccepted: input.autoDiscountAccepted,
      roundOff: input.roundOff, isOwner, advanceDeductedCents, returnCreditCents,
    });

    if (input.paymentMethod === "cash" && input.cashReceivedCents !== undefined && input.cashReceivedCents < totals.dueCents) {
      return reply.code(400).send({ error: "Cash received is less than the amount to pay" });
    }

    // Reuse an existing customer with the same phone so one person never gets split balances.
    const knownCustomerId = input.customerId ?? findCustomerIdByPhone(input.customerPhone);

    // Credit sales require the owner authorization password, verified server-side, inside this same request.
    if (input.paymentMethod === "credit") {
      if (!knownCustomerId && !input.customerName.trim()) {
        return reply.code(400).send({ error: "Enter the customer name for a credit sale" });
      }
      if (!input.ownerAuthPassword) return reply.code(400).send({ error: "Owner authorization password is required for credit sales" });
      const valid = await verify(settingsRow.ownerAuthPasswordHash, input.ownerAuthPassword);
      if (!valid) {
        logActivity({ userId: user.id, action: "owner_auth_failed", details: { context: "credit_sale" } });
        return reply.code(401).send({ error: "Wrong authorization password" });
      }
      if (knownCustomerId) {
        const customer = db.select().from(customers).where(eq(customers.id, knownCustomerId)).get();
        if (customer && customer.creditLimitCents > 0) {
          const currentBalance = customerBalanceCents(customer.id);
          const newBalance = currentBalance + totals.dueCents - input.creditPaidNowCents;
          if (newBalance > customer.creditLimitCents) {
            return reply.code(409).send({
              error: `${customer.name} would owe Rs. ${(newBalance / 100).toFixed(2)}, above their limit of Rs. ${(customer.creditLimitCents / 100).toFixed(2)}`,
              code: "OVER_CREDIT_LIMIT",
            });
          }
        }
      }
    }

    const nowIso = now.toISOString();
    const isPureRefund = resolvedLines.length === 0 && input.services.length === 0 && resolvedReturns.length > 0;

    let result: { sale: typeof sales.$inferSelect | null; changeCents: number; returnNos: string[] };
    try {
      result = db.transaction((tx) => {
        // Re-check stock inside the transaction in case it changed between the read above and now.
        for (const line of resolvedLines) {
          const current = db.select().from(partGrades).where(eq(partGrades.id, line.gradeRowId)).get()!;
          if (line.qty > current.qty) throw new StockChangedError(line.partId, line.grade);
        }

        let customerId = knownCustomerId;
        if (!customerId && input.customerName.trim()) {
          const [created] = tx.insert(customers).values({
            name: input.customerName.trim(), phone: input.customerPhone.trim(), vehicleNo: input.vehicleNo.trim(),
            createdAt: nowIso,
          }).returning().all();
          customerId = created.id;
        }

        // Pure refund: no sale row at all, just return rows + stock-in + optional credit-balance adjustment.
        if (isPureRefund) {
          const returnNos: string[] = [];
          for (const r of resolvedReturns) {
            const grade = tx.select().from(partGrades).where(eq(partGrades.partId, r.partId)).all().find((g) => g.grade === r.grade);
            if (grade) tx.update(partGrades).set({ qty: grade.qty + r.qty }).where(eq(partGrades.id, grade.id)).run();
            const returnNo = nextSeq("RET", returns, undefined, tx);
            const [returnRow] = tx.insert(returns).values({
              returnNo, partyType: "customer", customerId, saleId: r.saleId,
              partId: r.partId, grade: r.grade, qty: r.qty, amountCents: r.qty * r.unitPriceCents,
              reason: r.reason, createdBy: user.id, createdAt: nowIso,
            }).returning().all();
            tx.insert(stockMovements).values({
              partId: r.partId, grade: r.grade, qtyDelta: r.qty, reason: "return",
              note: `Return ${returnRow.returnNo} from bill ${r.invoiceNo}`, refType: "return", refId: returnRow.id,
              userId: user.id, createdAt: nowIso,
            }).run();
            returnNos.push(returnNo);
          }

          // Credit the customer's running balance if asked (reduces what they owe us next time).
          if (input.applyRefundToCredit && customerId) {
            const paymentNo = nextSeq("RCP", payments, eq(payments.type, "customer_credit"), tx);
            tx.insert(payments).values({
              paymentNo, type: "customer_credit", partyId: customerId,
              amountCents: returnCreditCents, method: "cash",
              chequeNo: "", chequeDate: null,
              note: `Refund credit from returns ${returnNos.join(", ")}`,
              createdBy: user.id, createdAt: nowIso,
            }).run();
          }

          return { sale: null, changeCents: -returnCreditCents, returnNos };
        }

        // Computed inside the transaction (using tx, not db) so the count-then-insert is atomic — avoids a
        // duplicate invoice number if two sales are created at nearly the same instant.
        const invoiceNo = nextSeq("INV", sales, undefined, tx);

        const amountPaidCents = input.paymentMethod === "credit"
          ? totals.creditAppliedCents + input.creditPaidNowCents
          : totals.totalCents;
        // Negative changeCents = cash paid out to the customer (return credit exceeded the bill).
        const changeCents = totals.refundOutCents > 0
          ? -totals.refundOutCents
          : input.paymentMethod === "cash" && input.cashReceivedCents !== undefined
            ? input.cashReceivedCents - totals.dueCents
            : 0;

        const [sale] = tx.insert(sales).values({
          invoiceNo, customerId, vehicleNo: input.vehicleNo,
          mechanicId: input.mechanicId ?? null, jobId: input.jobId ?? null, preOrderId: input.preOrderId ?? null,
          subtotalCents: totals.subtotalCents, discountPct: totals.discountPct, discountCents: totals.discountCents,
          autoDiscountApplied: totals.autoDiscountApplied, roundOffCents: totals.roundOffCents, taxCents: totals.taxCents,
          advanceDeductedCents: totals.advanceDeductedCents, totalCents: totals.totalCents,
          paymentMethod: input.paymentMethod, amountPaidCents, changeCents,
          createdBy: user.id, createdAt: nowIso,
        }).returning().all();

        for (const line of resolvedLines) {
          tx.insert(saleItems).values({
            saleId: sale.id, partId: line.partId, grade: line.grade, qty: line.qty,
            unitPriceCents: line.unitPriceCents, unitCostCents: line.unitCostCents,
          }).run();
          tx.update(partGrades).set({ qty: line.availableQty - line.qty }).where(eq(partGrades.id, line.gradeRowId)).run();
          tx.insert(stockMovements).values({
            partId: line.partId, grade: line.grade, qtyDelta: -line.qty, reason: "sale",
            note: `Sale ${invoiceNo}`, refType: "sale", refId: sale.id, userId: user.id, createdAt: nowIso,
          }).run();
        }

        for (const svc of input.services) {
          tx.insert(saleServices).values({
            saleId: sale.id, description: svc.description, amountCents: svc.amount, mechanicId: svc.mechanicId ?? null,
          }).run();
        }

        const returnNos: string[] = [];
        for (const r of resolvedReturns) {
          const grade = tx.select().from(partGrades).where(eq(partGrades.partId, r.partId)).all().find((g) => g.grade === r.grade);
          if (grade) tx.update(partGrades).set({ qty: grade.qty + r.qty }).where(eq(partGrades.id, grade.id)).run();
          const returnNo = nextSeq("RET", returns, undefined, tx);
          const [returnRow] = tx.insert(returns).values({
            returnNo, partyType: "customer", customerId, saleId: r.saleId,
            partId: r.partId, grade: r.grade, qty: r.qty, amountCents: r.qty * r.unitPriceCents,
            reason: r.reason, createdBy: user.id, createdAt: nowIso,
          }).returning().all();
          tx.insert(stockMovements).values({
            partId: r.partId, grade: r.grade, qtyDelta: r.qty, reason: "return",
            note: `Return ${returnRow.returnNo} on sale ${invoiceNo} (from bill ${r.invoiceNo})`,
            refType: "return", refId: returnRow.id, userId: user.id, createdAt: nowIso,
          }).run();
          returnNos.push(returnNo);
        }

        if (input.jobId) {
          tx.update(serviceJobs).set({ status: "billed", saleId: sale.id }).where(eq(serviceJobs.id, input.jobId)).run();
        }
        if (input.preOrderId) {
          tx.update(preOrders).set({ status: "delivered", saleId: sale.id }).where(eq(preOrders.id, input.preOrderId)).run();
        }

        return { sale, changeCents, returnNos };
      });
    } catch (err) {
      if (err instanceof StockChangedError) {
        return reply.code(409).send({ error: `Stock changed for part ${err.partId} (${err.grade}) — check the quantity`, code: "STOCK_CHANGED" });
      }
      throw err;
    }

    if (result.sale) {
      logActivity({
        userId: user.id, action: "sale", entityType: "sale", entityId: result.sale.id,
        details: { invoiceNo: result.sale.invoiceNo, totalCents: totals.totalCents, paymentMethod: input.paymentMethod, discountPct: totals.discountPct, autoDiscountApplied: totals.autoDiscountApplied },
      });
      if (input.paymentMethod === "credit") {
        logActivity({
          userId: user.id, action: "credit_approved", entityType: "sale", entityId: result.sale.id,
          details: { invoiceNo: result.sale.invoiceNo, owedCents: totals.dueCents - input.creditPaidNowCents },
        });
      }
    }
    for (const returnNo of result.returnNos) {
      logActivity({
        userId: user.id, action: "return", entityType: "customer", entityId: input.customerId,
        details: { returnNo, refundOutCents: totals.refundOutCents, appliedAgainst: result.sale?.invoiceNo ?? null },
      });
    }

    reply.send({ sale: result.sale, change: result.changeCents, totals, returnNos: result.returnNos });
  });

  app.get("/api/sales", { preHandler: app.requireAuth }, async (req) => {
    const user = req.session.user!;
    const { from, to, q, discountedOnly, createdBy } = req.query as { from?: string; to?: string; q?: string; discountedOnly?: string; createdBy?: string };
    let rows = db.select().from(sales).all();

    if (user.role !== "owner") rows = rows.filter((s) => s.createdBy === user.id);
    else if (createdBy) rows = rows.filter((s) => s.createdBy === Number(createdBy));

    if (from) rows = rows.filter((s) => s.createdAt >= from);
    if (to) rows = rows.filter((s) => s.createdAt <= `${to}T23:59:59.999Z`);
    if (discountedOnly === "1") rows = rows.filter((s) => s.discountPct > 0);

    rows.sort((a, b) => b.id - a.id);

    const withDetail = rows.map((s) => {
      const customer = s.customerId ? db.select().from(customers).where(eq(customers.id, s.customerId)).get() : null;
      const billedBy = db.select().from(users).where(eq(users.id, s.createdBy)).get();
      return { ...s, customer, billedByName: billedBy?.name ?? "" };
    });

    const filtered = q
      ? withDetail.filter((s) => [s.invoiceNo, s.customer?.name, s.vehicleNo].join(" ").toLowerCase().includes(q.toLowerCase()))
      : withDetail;

    return { sales: filtered.slice(0, 300) };
  });

  app.get("/api/sales/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const canCost = user.role === "owner" || user.canCost;
    const id = Number((req.params as { id: string }).id);
    const sale = db.select().from(sales).where(eq(sales.id, id)).get();
    if (!sale) return reply.code(404).send({ error: "Sale not found" });
    const items = db.select().from(saleItems).where(eq(saleItems.saleId, id)).all();
    const services = db.select().from(saleServices).where(eq(saleServices.saleId, id)).all();
    const itemsWithParts = items.map((i) => {
      const { unitCostCents, ...rest } = i;
      const returnRows = db.select().from(returns)
        .where(and(eq(returns.saleId, id), eq(returns.partId, i.partId), eq(returns.grade, i.grade)))
        .all();
      const alreadyReturnedQty = returnRows.reduce((s, row) => s + row.qty, 0);
      const returnRefs = returnRows.map((row) => ({ returnNo: row.returnNo, qty: row.qty, createdAt: row.createdAt }));
      return { ...rest, ...(canCost ? { unitCostCents } : {}), alreadyReturnedQty, returnRefs, part: db.select().from(parts).where(eq(parts.id, i.partId)).get() };
    });
    const customer = sale.customerId ? db.select().from(customers).where(eq(customers.id, sale.customerId)).get() : null;
    const voidedBy = sale.voidedBy ? db.select().from(users).where(eq(users.id, sale.voidedBy)).get() : null;
    reply.send({ sale, items: itemsWithParts, services, customer, voidedByName: voidedBy?.name ?? null });
  });

  app.post("/api/sales/:id/void", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const sale = db.select().from(sales).where(eq(sales.id, id)).get();
    if (!sale) return reply.code(404).send({ error: "Sale not found" });
    if (sale.status === "voided") return reply.code(400).send({ error: "This bill is already voided" });

    const parsed = VoidSaleInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const settingsRow = db.select().from(settings).get();
    if (!settingsRow) return reply.code(500).send({ error: "Shop settings not configured" });
    const valid = await verify(settingsRow.ownerAuthPasswordHash, input.ownerAuthPassword);
    if (!valid) {
      logActivity({ userId: user.id, action: "owner_auth_failed", details: { context: "void_sale", saleId: id } });
      return reply.code(401).send({ error: "Wrong authorization password" });
    }

    const now = new Date().toISOString();
    db.transaction((tx) => {
      const items = tx.select().from(saleItems).where(eq(saleItems.saleId, id)).all();
      for (const item of items) {
        const grade = tx.select().from(partGrades).where(eq(partGrades.partId, item.partId)).all().find((g) => g.grade === item.grade);
        if (grade) tx.update(partGrades).set({ qty: grade.qty + item.qty }).where(eq(partGrades.id, grade.id)).run();
        tx.insert(stockMovements).values({
          partId: item.partId, grade: item.grade, qtyDelta: item.qty, reason: "void",
          note: `Void ${sale.invoiceNo}`, refType: "sale", refId: sale.id, userId: user.id, createdAt: now,
        }).run();
      }

      tx.update(sales).set({
        status: "voided", voidedAt: now, voidedBy: user.id, voidReason: input.reason,
      }).where(eq(sales.id, id)).run();

      if (sale.jobId) {
        tx.update(serviceJobs).set({ status: "open", saleId: null }).where(eq(serviceJobs.id, sale.jobId)).run();
      }
      if (sale.preOrderId) {
        tx.update(preOrders).set({ status: "arrived", saleId: null }).where(eq(preOrders.id, sale.preOrderId)).run();
      }
    });

    logActivity({ userId: user.id, action: "void", entityType: "sale", entityId: id, details: { invoiceNo: sale.invoiceNo, totalCents: sale.totalCents, reason: input.reason } });
    reply.send({ ok: true });
  });
}
