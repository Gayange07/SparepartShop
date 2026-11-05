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
let mechanicId: number;
const today = new Date().toISOString().slice(0, 10);

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
  const salesRoutes = (await import("../sales/routes.js")).default;
  const reportsRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    { name: "Nimal", username: "nimal", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false, salaryCents: 0, commissionPct: 10, createdAt: now },
  ]).run();
  const [mech] = db.insert(schema.mechanics).values({
    name: "Ruwan", salaryCents: 0, commissionPct: 20, createdAt: now,
  }).returning().all();
  mechanicId = mech.id;

  const [part] = db.insert(schema.parts).values({
    partNo: "REP-001", name: "Chain", manufacturer: "Bajaj", category: "Transmission",
    vehicleType: "Motorcycle", rack: "A1", models: ["CT100"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  db.insert(schema.partGrades).values({ partId: part.id, grade: "GEN", costCents: 70000, priceCents: 100000, qty: 1000, reorderLevel: 3 }).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(salesRoutes);
  await app.register(reportsRoutes);

  ownerCookie = await login("admin", "12345");
  shopkeeperCookie = await login("nimal", "1111");
});

describe("GET /api/reports/*", () => {
  it("rejects a shopkeeper from all report endpoints (owner only)", async () => {
    for (const url of ["/api/reports/overview?from=2026-01-01&to=2026-12-31", "/api/reports/staff?from=2026-01-01&to=2026-12-31", "/api/reports/stock-value", "/api/reports/to-order"]) {
      const res = await app.inject({ method: "GET", url, cookies: { sessionId: shopkeeperCookie } });
      expect(res.statusCode).toBe(403);
    }
  });

  it("rejects a bad date range", async () => {
    const res = await app.inject({ method: "GET", url: "/api/reports/overview?from=2026-12-31&to=2026-01-01", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(400);
  });

  it("counts a cash sale into the overview totals, parts, and dayByDay", async () => {
    const sale = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 2 }], paymentMethod: "cash", cashReceivedCents: 200000 },
    });
    expect(sale.statusCode).toBe(200);

    const res = await app.inject({ method: "GET", url: `/api/reports/overview?from=${today}&to=${today}`, cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalSalesCents).toBeGreaterThanOrEqual(200000);
    expect(body.grossProfitCents).toBeGreaterThanOrEqual(60000); // (100000 - 70000) * 2
    expect(body.partsSoldQty).toBeGreaterThanOrEqual(2);
    expect(body.dayByDay.find((d: { date: string }) => d.date === today)).toBeTruthy();
    expect(body.topParts[0].partId).toBe(partId);
  });

  it("credits the shopkeeper's own cash sale toward their commission in the staff report", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: shopkeeperCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000 },
    });
    expect(res.statusCode).toBe(200);

    const report = await app.inject({ method: "GET", url: `/api/reports/staff?from=${today}&to=${today}`, cookies: { sessionId: ownerCookie } });
    const nimal = report.json().rows.find((r: { staffType: string; name: string }) => r.staffType === "user" && r.name === "Nimal");
    expect(nimal.profitCents).toBeGreaterThanOrEqual(30000);
    expect(nimal.commissionCents).toBe(Math.round(nimal.profitCents * 0.1));
  });

  it("credits a mechanic per service line, not for a whole bill they're not on", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [],
        services: [{ description: "Oil change", amount: 50000, mechanicId }],
        paymentMethod: "cash", cashReceivedCents: 50000,
      },
    });
    expect(res.statusCode).toBe(200);

    const report = await app.inject({ method: "GET", url: `/api/reports/staff?from=${today}&to=${today}`, cookies: { sessionId: ownerCookie } });
    const ruwan = report.json().rows.find((r: { staffType: string; name: string }) => r.staffType === "mechanic" && r.name === "Ruwan");
    expect(ruwan.profitCents).toBeGreaterThanOrEqual(50000);
    expect(ruwan.commissionCents).toBe(Math.round(ruwan.profitCents * 0.2));
    expect(ruwan.jobsDone).toBe(1);
  });

  it("flags low-stock parts under the reorder level in the to-order report", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const grade = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all().find((g) => g.grade === "GEN")!;
    db.update(schema.partGrades).set({ qty: 1 }).where(eq(schema.partGrades.id, grade.id)).run();

    const res = await app.inject({ method: "GET", url: "/api/reports/to-order", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().lowStock.some((r: { partId: number }) => r.partId === partId)).toBe(true);
  });

  it("reports a sensible stock-value snapshot", async () => {
    const res = await app.inject({ method: "GET", url: "/api/reports/stock-value", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.itemsInStock).toBeGreaterThanOrEqual(0);
    expect(body.valueAtPriceCents).toBeGreaterThanOrEqual(body.valueAtCostCents);
  });
});

describe("GET /api/dashboard/summary", () => {
  it("hides owes-balances and today's profit from a shopkeeper without cost permission", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/summary", cookies: { sessionId: shopkeeperCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customersOweCents).toBeNull();
    expect(body.suppliersOweCents).toBeNull();
    expect(body.todayProfitCents).toBeNull();
    expect(typeof body.todaySalesCents).toBe("number");
  });

  it("returns real numbers for the owner", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/summary", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.todaySalesCents).toBe("number");
    expect(typeof body.todayProfitCents).toBe("number");
    expect(typeof body.customersOweCents).toBe("number");
    expect(typeof body.suppliersOweCents).toBe("number");
  });
});

describe("GET /api/reports/overview.csv", () => {
  it("returns a CSV body with the Content-Type header set", async () => {
    const res = await app.inject({ method: "GET", url: `/api/reports/overview.csv?from=${today}&to=${today}`, cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/csv/);
    expect(res.body.startsWith('"Invoice"')).toBe(true);
  });
});
