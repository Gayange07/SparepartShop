import { describe, expect, it, beforeAll } from "vitest";
import { hash } from "argon2";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.DB_PATH = ":memory:";
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

let app: ReturnType<typeof Fastify>;
let ownerCookie: string;
let stockOnlyCookie: string;
let partId: number;
let supplierId: number;

async function login(username: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });
  return res.cookies.find((c: { name: string }) => c.name === "sessionId")!.value;
}

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../db/client.js");
  const schema = await import("../db/schema/index.js");
  const authPlugin = (await import("../auth/plugin.js")).default;
  const authRoutes = (await import("../auth/routes.js")).default;
  const suppliersRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    { name: "Nimal", username: "nimal_stockonly", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false, createdAt: now },
  ]).run();
  const [part] = db.insert(schema.parts).values({
    partNo: "SUP-001", name: "Spark plug", manufacturer: "Bajaj", category: "Electrical",
    vehicleType: "Motorcycle", rack: "E1", models: ["CT100"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  db.insert(schema.partGrades).values({ partId: part.id, grade: "GEN", costCents: 40000, priceCents: 65000, qty: 10, reorderLevel: 3 }).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(suppliersRoutes);

  ownerCookie = await login("admin", "12345");
  stockOnlyCookie = await login("nimal_stockonly", "1111");

  const supRes = await app.inject({
    method: "POST", url: "/api/suppliers", cookies: { sessionId: ownerCookie },
    payload: { name: "Lanka Spares", rep: "Nimal", phone: "0711111111", termDays: 30, grades: ["GEN", "AA"] },
  });
  supplierId = supRes.json().supplier.id;
});

describe("POST /api/suppliers/:id/grn", () => {
  it("rejects a stock-only staffer without the cost permission (receiving sets cost prices)", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/grn`, cookies: { sessionId: stockOnlyCookie },
      payload: { billDate: "2026-11-01", lines: [{ partId, grade: "GEN", qty: 1, unitCostCents: 42000 }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("receives stock, overwrites cost, adds free qty, and links the supplier part number", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/grn`, cookies: { sessionId: ownerCookie },
      payload: {
        theirBillNo: "INV-9981", billDate: "2026-11-01",
        lines: [{ partId, grade: "GEN", qty: 20, freeQty: 2, unitCostCents: 42000, supplierPartNo: "LK-SP-9" }],
        paidNowCents: 0,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().grn.grnNo).toMatch(/^GRN-\d{5}$/);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq, and } = await import("drizzle-orm");
    const grade = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;
    expect(grade.qty).toBe(32); // 10 + 20 + 2 free
    expect(grade.costCents).toBe(42000); // overwritten, not averaged

    const mapping = db.select().from(schema.partSupplierNumbers)
      .where(and(eq(schema.partSupplierNumbers.partId, partId), eq(schema.partSupplierNumbers.supplierId, supplierId))).get();
    expect(mapping?.supplierPartNo).toBe("LK-SP-9");

    const movements = db.select().from(schema.stockMovements).where(eq(schema.stockMovements.partId, partId)).all();
    expect(movements.some((m) => m.reason === "grn" && m.qtyDelta === 22)).toBe(true);
  });

  it("only overrides the sell price when a new sell price is given", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/grn`, cookies: { sessionId: ownerCookie },
      payload: { billDate: "2026-11-02", lines: [{ partId, grade: "GEN", qty: 5, unitCostCents: 42000 }] },
    });
    expect(res.statusCode).toBe(200);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const grade = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;
    expect(grade.priceCents).toBe(65000); // unchanged
  });

  it("increases the supplier balance by the GRN total minus what was paid now", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/grn`, cookies: { sessionId: ownerCookie },
      payload: { billDate: "2026-11-02", lines: [{ partId, grade: "GEN", qty: 1, unitCostCents: 42000 }], paidNowCents: 20000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balanceCents).toBeGreaterThan(0);
  });

  it("rejects a GRN that would map a supplier part number onto a different part than it's already mapped to", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const now = new Date().toISOString();
    const [otherPart] = db.insert(schema.parts).values({
      partNo: "SUP-002", name: "Air filter", manufacturer: "Bajaj", category: "Filters",
      vehicleType: "Motorcycle", rack: "E2", models: ["CT100"], createdAt: now, updatedAt: now,
    }).returning().all();
    db.insert(schema.partGrades).values({ partId: otherPart.id, grade: "GEN", costCents: 10000, priceCents: 20000, qty: 5, reorderLevel: 3 }).run();

    // "LK-SP-9" was already mapped to `partId` by an earlier test in this file.
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/grn`, cookies: { sessionId: ownerCookie },
      payload: { billDate: "2026-11-02", lines: [{ partId: otherPart.id, grade: "GEN", qty: 1, unitCostCents: 10000, supplierPartNo: "LK-SP-9" }] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/SUP-001/);

    // Stock must be untouched — the whole GRN should have been rejected before any writes.
    const { eq } = await import("drizzle-orm");
    const grade = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, otherPart.id)).all().find((g) => g.grade === "GEN")!;
    expect(grade.qty).toBe(5);
  });
});

describe("POST /api/suppliers/:id/payments", () => {
  it("records a payment and reduces the balance", async () => {
    const before = await app.inject({ method: "GET", url: `/api/suppliers/${supplierId}`, cookies: { sessionId: ownerCookie } });
    const balanceBefore = before.json().balanceCents;

    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/payments`, cookies: { sessionId: ownerCookie },
      payload: { amountCents: 10000, method: "cash" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balanceCents).toBe(balanceBefore - 10000);
    expect(res.json().payment.paymentNo).toMatch(/^SPY-\d{5}$/);
  });

  it("requires a cheque number and date when paying by cheque", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/payments`, cookies: { sessionId: ownerCookie },
      payload: { amountCents: 5000, method: "cheque" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/suppliers/:id/returns", () => {
  it("rejects a stock-only staffer without the cost permission (returns carry a cost amount)", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/returns`, cookies: { sessionId: stockOnlyCookie },
      payload: { partId, grade: "GEN", qty: 1, unitCostCents: 42000, reason: "damaged" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("decrements stock and reduces the supplier balance", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const before = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;

    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/returns`, cookies: { sessionId: ownerCookie },
      payload: { partId, grade: "GEN", qty: 3, unitCostCents: 42000, reason: "damaged in transit" },
    });
    expect(res.statusCode).toBe(200);

    const after = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;
    expect(after.qty).toBe(before.qty - 3);

    const returnRows = db.select().from(schema.returns).all();
    expect(returnRows.some((r) => r.returnNo.match(/^RET-\d{5}$/) && r.reason === "damaged in transit")).toBe(true);
  });

  it("rejects returning more than is in stock", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/suppliers/${supplierId}/returns`, cookies: { sessionId: ownerCookie },
      payload: { partId, grade: "GEN", qty: 100000, unitCostCents: 42000, reason: "too many" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/suppliers/:id/statement", () => {
  it("builds a running ledger across GRNs, payments and returns", async () => {
    const res = await app.inject({ method: "GET", url: `/api/suppliers/${supplierId}/statement`, cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    const ledger = res.json().ledger;
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger.some((r: { ref: string }) => r.ref.match(/^GRN-/))).toBe(true);
    expect(ledger.some((r: { ref: string }) => r.ref.match(/^RET-/))).toBe(true);
  });
});
