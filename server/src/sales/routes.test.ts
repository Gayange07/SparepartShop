import { describe, expect, it, beforeAll } from "vitest";
import { hash } from "argon2";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.DB_PATH = ":memory:";
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

let app: ReturnType<typeof Fastify>;
let ownerCookie: string;
let shopkeeperCookie: string;
let partId: number;

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
  const salesRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  // maxDiscountPct 5, autoDiscountOver Rs 5000 (500000c), autoDiscountPct 5, roundTo Rs 10 (1000c), round down, no tax.
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    { name: "Nimal", username: "nimal", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false, createdAt: now },
  ]).run();

  const [part] = db.insert(schema.parts).values({
    partNo: "SALE-001", name: "Brake pad", manufacturer: "Bajaj", category: "Brakes",
    vehicleType: "Motorcycle", rack: "A1", models: ["CT100"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  // Rs 1,000.00 each, plenty in stock across the whole test file.
  db.insert(schema.partGrades).values([
    { partId: part.id, grade: "GEN", costCents: 70000, priceCents: 100000, qty: 1000, reorderLevel: 3 },
  ]).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(salesRoutes);

  ownerCookie = await login("admin", "12345");
  shopkeeperCookie = await login("nimal", "1111");
});

describe("POST /api/sales", () => {
  it("completes a cash sale, decrements stock, and records a stock movement", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [{ partId, grade: "GEN", qty: 2 }],
        paymentMethod: "cash", cashReceivedCents: 200000,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sale.totalCents).toBe(200000);
    expect(body.sale.invoiceNo).toMatch(/^INV-\d{5}$/);
    expect(body.change).toBe(0);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const grade = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;
    expect(grade.qty).toBe(998); // 1000 - 2

    const movements = db.select().from(schema.stockMovements).where(eq(schema.stockMovements.partId, partId)).all();
    expect(movements.some((m) => m.qtyDelta === -2 && m.reason === "sale")).toBe(true);
  });

  it("rejects a sale that would take stock below zero", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 100000 }], paymentMethod: "cash" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/in stock/);
  });

  it("computes change correctly for cash sales", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 150000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().change).toBe(50000);
  });

  it("rejects cash received less than the amount due", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 50000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("applies the big-bill auto discount when subtotal crosses the threshold", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 6 }], paymentMethod: "cash", cashReceivedCents: 600000 }, // 6000.00 subtotal
    });
    expect(res.statusCode).toBe(200);
    const sale = res.json().sale;
    expect(sale.autoDiscountApplied).toBe(true);
    expect(sale.discountPct).toBe(5);
    expect(sale.totalCents).toBe(570000); // 600000 - 5%
  });

  it("caps a shopkeeper's manual discount at the setting even if the client sends a higher percent", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: shopkeeperCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000, discountPct: 50 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sale.discountPct).toBe(5);
  });

  it("does not cap the owner's manual discount", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000, discountPct: 50 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sale.discountPct).toBe(50);
  });

  it("rejects a credit sale without the owner authorization password", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "credit", customerName: "Saman Garage" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a credit sale with the wrong owner authorization password and logs owner_auth_failed", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "credit", customerName: "Saman Garage", ownerAuthPassword: "wrong" },
    });
    expect(res.statusCode).toBe(401);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const rows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "owner_auth_failed")).all();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("completes a credit sale with the correct password and logs credit_approved", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "credit", customerName: "Saman Garage", ownerAuthPassword: "99999" },
    });
    expect(res.statusCode).toBe(200);
    const sale = res.json().sale;
    expect(sale.paymentMethod).toBe("credit");

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const rows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "credit_approved")).all();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("rejects a sale with no items", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [], paymentMethod: "cash" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await app.inject({ method: "POST", url: "/api/sales", payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/sales/:id/void", () => {
  it("restores stock, marks the sale voided, and logs the void", async () => {
    const saleRes = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 3 }], paymentMethod: "cash", cashReceivedCents: 300000 },
    });
    const saleId = saleRes.json().sale.id;

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const before = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;

    const voidRes = await app.inject({
      method: "POST", url: `/api/sales/${saleId}/void`, cookies: { sessionId: ownerCookie },
      payload: { reason: "Customer changed their mind", ownerAuthPassword: "99999" },
    });
    expect(voidRes.statusCode).toBe(200);

    const after = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;
    expect(after.qty).toBe(before.qty + 3);

    const sale = db.select().from(schema.sales).where(eq(schema.sales.id, saleId)).get()!;
    expect(sale.status).toBe("voided");
    expect(sale.voidReason).toBe("Customer changed their mind");

    const movements = db.select().from(schema.stockMovements).where(eq(schema.stockMovements.refId, saleId)).all();
    expect(movements.some((m) => m.reason === "void" && m.qtyDelta === 3)).toBe(true);

    const logRows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "void")).all();
    expect(logRows.length).toBeGreaterThan(0);
  });

  it("rejects voiding with the wrong owner authorization password", async () => {
    const saleRes = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000 },
    });
    const saleId = saleRes.json().sale.id;

    const res = await app.inject({
      method: "POST", url: `/api/sales/${saleId}/void`, cookies: { sessionId: ownerCookie },
      payload: { reason: "Mistake", ownerAuthPassword: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects voiding a bill that is already voided", async () => {
    const saleRes = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000 },
    });
    const saleId = saleRes.json().sale.id;
    await app.inject({
      method: "POST", url: `/api/sales/${saleId}/void`, cookies: { sessionId: ownerCookie },
      payload: { reason: "First void", ownerAuthPassword: "99999" },
    });

    const res = await app.inject({
      method: "POST", url: `/api/sales/${saleId}/void`, cookies: { sessionId: ownerCookie },
      payload: { reason: "Second void", ownerAuthPassword: "99999" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("requires a reason", async () => {
    const saleRes = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000 },
    });
    const saleId = saleRes.json().sale.id;

    const res = await app.inject({
      method: "POST", url: `/api/sales/${saleId}/void`, cookies: { sessionId: ownerCookie },
      payload: { reason: "", ownerAuthPassword: "99999" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/sales/:id — cost visibility", () => {
  it("hides unitCostCents from a staff member without the cost permission", async () => {
    const saleRes = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000 },
    });
    const saleId = saleRes.json().sale.id;

    const asShopkeeper = await app.inject({ method: "GET", url: `/api/sales/${saleId}`, cookies: { sessionId: shopkeeperCookie } });
    expect(asShopkeeper.statusCode).toBe(200);
    expect(asShopkeeper.json().items[0].unitCostCents).toBeUndefined();

    const asOwner = await app.inject({ method: "GET", url: `/api/sales/${saleId}`, cookies: { sessionId: ownerCookie } });
    expect(asOwner.json().items[0].unitCostCents).toBe(70000);
  });
});

describe("credit limit enforcement", () => {
  it("rejects a credit sale that would push the customer over their credit limit", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const now = new Date().toISOString();
    const [customer] = db.insert(schema.customers).values({
      name: "Limited Garage", phone: "0770000000", creditLimitCents: 50000, createdAt: now,
    }).returning().all();

    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "credit", customerId: customer.id, ownerAuthPassword: "99999" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("OVER_CREDIT_LIMIT");
  });

  it("matches an existing customer by phone when no id is sent, so the limit still applies", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "credit", customerName: "Limited Garage", customerPhone: "077 000 0000", ownerAuthPassword: "99999" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("OVER_CREDIT_LIMIT");
  });

  it("reuses the existing customer by phone instead of creating a duplicate", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const now = new Date().toISOString();
    db.insert(schema.customers).values({ name: "Kamal", phone: "0711234567", createdAt: now }).run();
    const before = db.select().from(schema.customers).all().length;

    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", customerName: "Kamal K", customerPhone: "071-123-4567" },
    });
    expect(res.statusCode).toBe(200);
    expect(db.select().from(schema.customers).all().length).toBe(before);
  });
});

describe("customer returns (exchange) via POST /api/sales", () => {
  async function createOriginalSale(qty: number) {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty }], paymentMethod: "cash", cashReceivedCents: qty * 100000 },
    });
    return res.json().sale;
  }

  it("takes an item back, restores stock, and offsets the current sale's due amount", async () => {
    const originalSale = await createOriginalSale(3);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const stockBefore = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!.qty;

    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [{ partId, grade: "GEN", qty: 2 }],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 1, reason: "customer changed mind" }],
        paymentMethod: "cash", cashReceivedCents: 100000, // 2*1000 - 1*1000 = 1000
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.returnCreditCents).toBe(100000);
    expect(body.totals.dueCents).toBe(100000);
    expect(body.returnNos.length).toBe(1);
    expect(body.returnNos[0]).toMatch(/^RET-\d{5}$/);

    const stockAfter = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!.qty;
    expect(stockAfter).toBe(stockBefore - 2 + 1); // sold 2, returned 1
  });

  it("surfaces refundOutCents as negative changeCents when return credit exceeds the new sale", async () => {
    const originalSale = await createOriginalSale(3);
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [{ partId, grade: "GEN", qty: 1 }],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 3, reason: "" }],
        paymentMethod: "cash", cashReceivedCents: 0,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.refundOutCents).toBe(200000); // 3*1000 - 1*1000 = 2000 back to customer
    expect(body.change).toBe(-200000);
    expect(body.sale.changeCents).toBe(-200000);
  });

  it("handles the pure-refund case (no new items, no new sale row)", async () => {
    const originalSale = await createOriginalSale(2);
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [], services: [],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 2, reason: "wrong part" }],
        paymentMethod: "cash",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sale).toBeNull();
    expect(body.returnNos.length).toBe(1);
    expect(body.totals.refundOutCents).toBe(200000);
  });

  it("rejects a return when the shopkeeper tries on a bill older than 2 days without owner auth", async () => {
    const originalSale = await createOriginalSale(1);
    // Backdate the bill by 3 days to simulate an aged return.
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const old = new Date(Date.now() - 3 * 86400000).toISOString();
    db.update(schema.sales).set({ createdAt: old }).where(eq(schema.sales.id, originalSale.id)).run();

    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: shopkeeperCookie },
      payload: {
        lines: [{ partId, grade: "GEN", qty: 1 }],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 1, reason: "" }],
        paymentMethod: "cash", cashReceivedCents: 0,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/older than 2 days/);
  });

  it("allows a shopkeeper to return an aged bill with the correct owner-auth password; logs failures otherwise", async () => {
    const originalSale = await createOriginalSale(1);
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const old = new Date(Date.now() - 3 * 86400000).toISOString();
    db.update(schema.sales).set({ createdAt: old }).where(eq(schema.sales.id, originalSale.id)).run();

    const bad = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: shopkeeperCookie },
      payload: {
        lines: [], services: [],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 1, reason: "" }],
        paymentMethod: "cash", ownerAuthPassword: "wrong",
      },
    });
    expect(bad.statusCode).toBe(401);
    const failedRows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "owner_auth_failed")).all();
    expect(failedRows.some((r: { details: unknown }) => (r.details as { context?: string } | null)?.context === "aged_return")).toBe(true);

    const ok = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: shopkeeperCookie },
      payload: {
        lines: [], services: [],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 1, reason: "" }],
        paymentMethod: "cash", ownerAuthPassword: "99999",
      },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("rejects returning more than were on the original bill (minus prior returns)", async () => {
    const originalSale = await createOriginalSale(2);
    await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [], services: [],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 1, reason: "" }],
        paymentMethod: "cash",
      },
    });
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [], services: [],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 2, reason: "" }],
        paymentMethod: "cash",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Only 1 left/);
  });

  it("rejects returning against a voided bill", async () => {
    const originalSale = await createOriginalSale(1);
    await app.inject({
      method: "POST", url: `/api/sales/${originalSale.id}/void`, cookies: { sessionId: ownerCookie },
      payload: { reason: "test void", ownerAuthPassword: "99999" },
    });

    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [], services: [],
        returns: [{ saleId: originalSale.id, partId, grade: "GEN", qty: 1, reason: "" }],
        paymentMethod: "cash",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/voided/);
  });

  it("records a customer_credit payment when applyRefundToCredit is set, reducing their outstanding balance", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");

    // Create a credit customer with an existing debt.
    const now = new Date().toISOString();
    const [customer] = db.insert(schema.customers).values({ name: "Credit Guy", phone: "0770001111", createdAt: now }).returning().all();
    const creditSale = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 2 }], paymentMethod: "credit", customerId: customer.id, ownerAuthPassword: "99999" },
    });
    expect(creditSale.statusCode).toBe(200);

    // Pure refund against that credit sale with applyRefundToCredit = true should insert an RCP- payment.
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [], services: [],
        returns: [{ saleId: creditSale.json().sale.id, partId, grade: "GEN", qty: 1, reason: "" }],
        customerId: customer.id,
        applyRefundToCredit: true,
        paymentMethod: "cash",
      },
    });
    expect(res.statusCode).toBe(200);

    const paymentRow = db.select().from(schema.payments)
      .where(eq(schema.payments.partyId, customer.id)).all()
      .find((p) => p.paymentNo.startsWith("RCP-"));
    expect(paymentRow).toBeTruthy();
    expect(paymentRow!.amountCents).toBe(100000);
  });
});

describe("POST /api/sales — a pre-order is billed only once", () => {
  it("refuses to bill a delivered pre-order again, so the advance is not deducted twice", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const now = new Date().toISOString();
    const [cust] = db.insert(schema.customers).values({ name: "Pre buyer", phone: "0712223334", createdAt: now }).returning().all();
    const [po] = db.insert(schema.preOrders).values({
      preOrderNo: "PRE-09001", customerId: cust.id, partId, grade: "GEN", qty: 1, partDescription: "Brake pad",
      orderDate: "2026-11-01", promisedDate: "2026-11-10", advancePaidCents: 20000, status: "arrived", recordedBy: 1, createdAt: now,
    }).returning().all();
    const sell = () => app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], customerId: cust.id, preOrderId: po.id, paymentMethod: "cash" },
    });
    const first = await sell();
    expect(first.statusCode).toBe(200);
    expect(first.json().sale.advanceDeductedCents).toBe(20000);
    const second = await sell();
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toBe("This pre-order is already delivered");
  });
});
