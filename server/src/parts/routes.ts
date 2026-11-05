import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { PartInput, StockMovementInput, computeStockDelta, parseCsv, type GradeKey } from "shared";
import { db } from "../db/client.js";
import { parts, partGrades, partSupplierNumbers, stockMovements } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";
import { listParts, getPartById } from "./query.js";

const CSV_GRADE_PREFIX: Record<GradeKey, string> = { GEN: "genuine", AA: "aa", A: "a" };
const VEHICLE_ALIASES: Record<string, "Motorcycle" | "Three-wheeler" | "Both"> = {
  motorcycle: "Motorcycle", bike: "Motorcycle",
  "three-wheeler": "Three-wheeler", "three wheeler": "Three-wheeler", threewheeler: "Three-wheeler",
  both: "Both",
};

export default async function partsRoutes(app: FastifyInstance) {
  app.get("/api/parts", { preHandler: app.requireAuth }, async (req) => {
    const user = req.session.user!;
    const { q, manufacturer, category, lowStockOnly } = req.query as Record<string, string | undefined>;

    let rows = listParts(user.role === "owner" || user.canCost);
    if (q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter((p) => {
        const hay = [p.partNo, p.name, p.manufacturer, p.category, ...p.models, ...p.supplierNumbers.map((s) => s.supplierPartNo)].join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    if (manufacturer) rows = rows.filter((p) => p.manufacturer === manufacturer);
    if (category) rows = rows.filter((p) => p.category === category);
    if (lowStockOnly === "true") {
      rows = rows.filter((p) => (Object.values(p.grades) as { qty: number; reorder: number }[]).some((g) => g.qty <= g.reorder));
    }
    rows.sort((a, b) => a.partNo.localeCompare(b.partNo));
    return { parts: rows };
  });

  app.get("/api/parts/manufacturers", { preHandler: app.requireAuth }, async () => {
    const rows = db.select({ manufacturer: parts.manufacturer }).from(parts).all();
    return { manufacturers: [...new Set(rows.map((r) => r.manufacturer))].sort() };
  });

  app.get("/api/parts/categories", { preHandler: app.requireAuth }, async () => {
    const rows = db.select({ category: parts.category }).from(parts).all();
    return { categories: [...new Set(rows.map((r) => r.category))].sort() };
  });

  app.get("/api/parts/models", { preHandler: app.requireAuth }, async () => {
    const rows = db.select({ models: parts.models }).from(parts).all();
    const all = rows.flatMap((r) => r.models).map((m) => m.trim()).filter(Boolean);
    return { models: [...new Set(all)].sort((a, b) => a.localeCompare(b)) };
  });

  app.get("/api/parts/:id/movements", { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const rows = db.select().from(stockMovements).where(eq(stockMovements.partId, id)).all();
    rows.sort((a, b) => b.id - a.id);
    reply.send({ movements: rows.slice(0, 15) });
  });

  app.post("/api/parts", { preHandler: app.requirePermission("stock") }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = PartInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const existing = db.select().from(parts).where(eq(parts.partNo, input.partNo)).get();
    if (existing) return reply.code(409).send({ error: "Another part already has this part number" });

    const now = new Date().toISOString();
    const canCost = user.role === "owner" || user.canCost;

    const result = db.transaction((tx) => {
      const [part] = tx.insert(parts).values({
        partNo: input.partNo, name: input.name, manufacturer: input.manufacturer, category: input.category,
        vehicleType: input.vehicleType, rack: input.rack, models: input.models,
        createdAt: now, updatedAt: now, updatedBy: user.id,
      }).returning().all();

      for (const key of ["GEN", "AA", "A"] as GradeKey[]) {
        const g = input.grades[key];
        if (!g) continue;
        const qty = g.qty ?? 0;
        tx.insert(partGrades).values({
          partId: part.id, grade: key,
          costCents: canCost ? (g.cost ?? 0) : 0,
          priceCents: g.price,
          qty, reorderLevel: g.reorder,
        }).run();
        if (qty > 0) {
          tx.insert(stockMovements).values({
            partId: part.id, grade: key, qtyDelta: qty, reason: "adjustment",
            note: "Stock when part added", refType: "part_created", refId: part.id, userId: user.id, createdAt: now,
          }).run();
        }
      }
      if (user.role === "owner") {
        for (const sn of input.supplierNumbers) {
          tx.insert(partSupplierNumbers).values({ partId: part.id, supplierId: sn.supplierId, supplierPartNo: sn.supplierPartNo }).run();
        }
      }
      return part;
    });

    logActivity({ userId: user.id, action: "part_created", entityType: "part", entityId: result.id, details: { partNo: input.partNo } });
    reply.send({ part: getPartById(result.id, canCost) });
  });

  app.put("/api/parts/:id", { preHandler: app.requirePermission("stock") }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const parsed = PartInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const before = getPartById(id, true);
    if (!before) return reply.code(404).send({ error: "Part not found" });

    const duplicate = db.select().from(parts).where(eq(parts.partNo, input.partNo)).get();
    if (duplicate && duplicate.id !== id) return reply.code(409).send({ error: "Another part already has this part number" });

    const now = new Date().toISOString();
    const canCost = user.role === "owner" || user.canCost;
    const priceChanges: string[] = [];
    const costChanges: string[] = [];

    db.transaction((tx) => {
      tx.update(parts).set({
        partNo: input.partNo, name: input.name, manufacturer: input.manufacturer, category: input.category,
        vehicleType: input.vehicleType, rack: input.rack, models: input.models,
        updatedAt: now, updatedBy: user.id,
      }).where(eq(parts.id, id)).run();

      for (const key of ["GEN", "AA", "A"] as GradeKey[]) {
        // A missing entry means "not carried" — same as an explicit price: null. Grade rows are
        // never deleted on edit (that would wipe qty/history); only part deletion removes them.
        const g = input.grades[key] ?? { price: null, reorder: 5 };
        const existingGrade = before.grades[key];
        if (existingGrade && existingGrade.price !== g.price) priceChanges.push(`${key} ${existingGrade.price ?? "—"}→${g.price ?? "—"}`);
        if (canCost && existingGrade?.cost !== undefined && g.cost !== undefined && existingGrade.cost !== g.cost) costChanges.push(`${key} ${existingGrade.cost}→${g.cost}`);

        const row = db.select().from(partGrades).where(eq(partGrades.partId, id)).all().find((r) => r.grade === key);
        if (row) {
          tx.update(partGrades).set({
            priceCents: g.price,
            reorderLevel: g.reorder,
            ...(canCost && g.cost !== undefined ? { costCents: g.cost } : {}),
          }).where(eq(partGrades.id, row.id)).run();
        } else {
          tx.insert(partGrades).values({
            partId: id, grade: key, costCents: canCost ? (g.cost ?? 0) : 0, priceCents: g.price, qty: 0, reorderLevel: g.reorder,
          }).run();
        }
      }

      if (user.role === "owner") {
        tx.delete(partSupplierNumbers).where(eq(partSupplierNumbers.partId, id)).run();
        for (const sn of input.supplierNumbers) {
          tx.insert(partSupplierNumbers).values({ partId: id, supplierId: sn.supplierId, supplierPartNo: sn.supplierPartNo }).run();
        }
      }
    });

    logActivity({ userId: user.id, action: "part_edited", entityType: "part", entityId: id, details: { partNo: input.partNo } });
    if (priceChanges.length) logActivity({ userId: user.id, action: "price_change", entityType: "part", entityId: id, details: { changes: priceChanges } });
    if (costChanges.length) logActivity({ userId: user.id, action: "cost_change", entityType: "part", entityId: id, details: { changes: costChanges } });

    reply.send({ part: getPartById(id, canCost) });
  });

  app.delete("/api/parts/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const part = db.select().from(parts).where(eq(parts.id, id)).get();
    if (!part) return reply.code(404).send({ error: "Part not found" });

    db.transaction((tx) => {
      tx.delete(stockMovements).where(eq(stockMovements.partId, id)).run();
      tx.delete(partGrades).where(eq(partGrades.partId, id)).run();
      tx.delete(partSupplierNumbers).where(eq(partSupplierNumbers.partId, id)).run();
      tx.delete(parts).where(eq(parts.id, id)).run();
    });
    logActivity({ userId: user.id, action: "part_deleted", entityType: "part", entityId: id, details: { partNo: part.partNo } });
    reply.send({ ok: true });
  });

  app.post("/api/parts/:id/stock", { preHandler: app.requirePermission("stock") }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const parsed = StockMovementInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    const row = db.select().from(partGrades).where(eq(partGrades.partId, id)).all().find((r) => r.grade === input.grade);
    if (!row) return reply.code(404).send({ error: "Grade not carried for this part" });

    const { delta, error } = computeStockDelta(row.qty, input);
    if (error) return reply.code(400).send({ error });

    const now = new Date().toISOString();
    const reasonWord = { in: "Stock in", out: "Stock out", set: "Stock count" }[input.action];
    const note = reasonWord + (input.note ? ` — ${input.note}` : "");

    db.transaction((tx) => {
      tx.update(partGrades).set({ qty: row.qty + delta }).where(eq(partGrades.id, row.id)).run();
      tx.insert(stockMovements).values({
        partId: id, grade: input.grade, qtyDelta: delta,
        reason: input.action === "set" ? "count" : "adjustment",
        note, userId: user.id, createdAt: now,
      }).run();
    });

    logActivity({
      userId: user.id, action: "stock_change", entityType: "part", entityId: id,
      details: { grade: input.grade, delta, note },
    });
    reply.send({ ok: true, qty: row.qty + delta });
  });

  app.post("/api/parts/import", { preHandler: app.requirePermission("stock") }, async (req, reply) => {
    const user = req.session.user!;
    const canCost = user.role === "owner" || user.canCost;
    const body = req.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: "No CSV content provided" });

    const rows = parseCsv(body.csv.replace(/^﻿/, ""));
    if (rows.length < 2) return reply.code(400).send({ error: "No data rows" });

    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const colIndex = (key: string) => header.indexOf(key);
    if (colIndex("part_no") < 0 || colIndex("name") < 0) {
      return reply.code(400).send({ error: "Columns part_no and name are required" });
    }

    const now = new Date().toISOString();
    let added = 0, updated = 0, skipped = 0;

    db.transaction((tx) => {
      for (const r of rows.slice(1)) {
        const cell = (key: string) => { const i = colIndex(key); return i < 0 ? "" : String(r[i] ?? "").trim(); };
        const partNo = cell("part_no");
        const name = cell("name");
        if (!partNo || !name) { skipped++; continue; }

        const existing = db.select().from(parts).where(eq(parts.partNo, partNo)).get();
        const vehicleCell = cell("vehicle").toLowerCase();

        let partId: number;
        if (existing) {
          tx.update(parts).set({
            name,
            manufacturer: cell("manufacturer") || existing.manufacturer,
            category: cell("category") || existing.category,
            rack: cell("location") || existing.rack,
            models: cell("models") ? cell("models").split(",").map((m) => m.trim()).filter(Boolean) : existing.models,
            vehicleType: vehicleCell ? (VEHICLE_ALIASES[vehicleCell] ?? existing.vehicleType) : existing.vehicleType,
            updatedAt: now, updatedBy: user.id,
          }).where(eq(parts.id, existing.id)).run();
          partId = existing.id;
          updated++;
        } else {
          const [created] = tx.insert(parts).values({
            partNo, name,
            manufacturer: cell("manufacturer"), category: cell("category"), rack: cell("location"),
            models: cell("models") ? cell("models").split(",").map((m) => m.trim()).filter(Boolean) : [],
            vehicleType: VEHICLE_ALIASES[vehicleCell] ?? "Motorcycle",
            createdAt: now, updatedAt: now, updatedBy: user.id,
          }).returning().all();
          partId = created.id;
          added++;
        }

        for (const key of ["GEN", "AA", "A"] as GradeKey[]) {
          const prefix = CSV_GRADE_PREFIX[key];
          const costCell = cell(`${prefix}_cost`);
          const priceCell = cell(`${prefix}_price`);
          const qtyCell = cell(`${prefix}_qty`);
          const addQty = Math.max(0, Math.floor(Number(qtyCell) || 0));

          const row = db.select().from(partGrades).where(eq(partGrades.partId, partId)).all().find((g) => g.grade === key);
          if (row) {
            tx.update(partGrades).set({
              ...(canCost && costCell !== "" ? { costCents: Math.round(Number(costCell) * 100) } : {}),
              ...(priceCell !== "" ? { priceCents: Math.round(Number(priceCell) * 100) } : {}),
              qty: row.qty + addQty,
            }).where(eq(partGrades.id, row.id)).run();
          } else {
            tx.insert(partGrades).values({
              partId, grade: key,
              costCents: canCost && costCell !== "" ? Math.round(Number(costCell) * 100) : 0,
              priceCents: priceCell !== "" ? Math.round(Number(priceCell) * 100) : null,
              qty: addQty, reorderLevel: 5,
            }).run();
          }
          if (addQty > 0) {
            tx.insert(stockMovements).values({
              partId, grade: key, qtyDelta: addQty, reason: "adjustment",
              note: "Excel import", userId: user.id, createdAt: now,
            }).run();
          }
        }
      }
    });

    logActivity({ userId: user.id, action: "part_edited", details: { event: "csv_import", added, updated, skipped } });
    reply.send({ added, updated, skipped });
  });
}
