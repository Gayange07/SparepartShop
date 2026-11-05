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
const period = new Date().toISOString().slice(0, 7);

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
  const staffRoutes = (await import("./routes.js")).default;
  const salesRoutes = (await import("../sales/routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    {
      name: "Nimal", username: "nimal", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false,
      salaryCents: 3000000, commissionPct: 10, monthlyTargetCents: 0, targetBonusCents: 0, createdAt: now,
    },
  ]).run();
  const [mech] = db.insert(schema.mechanics).values({
    name: "Ruwan", salaryCents: 2500000, commissionPct: 20, monthlyTargetCents: 0, targetBonusCents: 0, createdAt: now,
  }).returning().all();
  mechanicId = mech.id;

  const [part] = db.insert(schema.parts).values({
    partNo: "STF-001", name: "Brake pad", manufacturer: "Bajaj", category: "Brakes",
    vehicleType: "Motorcycle", rack: "A1", models: ["CT100"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  db.insert(schema.partGrades).values({ partId: part.id, grade: "GEN", costCents: 70000, priceCents: 100000, qty: 1000, reorderLevel: 3 }).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(staffRoutes);
  await app.register(salesRoutes);

  ownerCookie = await login("admin", "12345");
  shopkeeperCookie = await login("nimal", "1111");
});

describe("staff management", () => {
  it("rejects a shopkeeper managing staff", async () => {
    const res = await app.inject({ method: "GET", url: "/api/staff", cookies: { sessionId: shopkeeperCookie } });
    expect(res.statusCode).toBe(403);
  });

  it("creates a mechanic and never leaks a password hash for anyone", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/staff/mechanics", cookies: { sessionId: ownerCookie },
      payload: { name: "Saman", salaryCents: 2000000, commissionPct: 15 },
    });
    expect(res.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/staff", cookies: { sessionId: ownerCookie } });
    const body = JSON.stringify(list.json());
    expect(body).not.toContain("passwordHash");
  });

  it("rejects a duplicate username when creating a staff user", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/staff/users", cookies: { sessionId: ownerCookie },
      payload: { name: "Dup", username: "nimal", password: "1234", salaryCents: 0, commissionPct: 0 },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("GET /api/payroll — commission is a % of profit", () => {
  it("credits the shopkeeper's own cash sale profit toward their commission, with no mechanic credit for parts", async () => {
    // Sale: 1 unit, price 1000.00 (100000c), cost 700.00 (70000c) -> profit 30000c. Nimal made the sale, no mechanic.
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: shopkeeperCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "cash", cashReceivedCents: 100000 },
    });
    expect(res.statusCode).toBe(200);

    const payroll = await app.inject({ method: "GET", url: `/api/payroll?period=${period}`, cookies: { sessionId: ownerCookie } });
    expect(payroll.statusCode).toBe(200);
    const nimalRow = payroll.json().rows.find((r: { staffId: number; staffType: string }) => r.staffType === "user" && r.staffId === 2);
    expect(nimalRow.profitCents).toBeGreaterThanOrEqual(30000);
    expect(nimalRow.commission.commissionCents).toBe(Math.round(nimalRow.profitCents * 0.10));
  });

  it("credits a mechanic only for the service lines they personally performed, not the whole bill", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: {
        lines: [],
        services: [{ description: "Oil change", amount: 50000, mechanicId }],
        paymentMethod: "cash", cashReceivedCents: 50000,
      },
    });
    expect(res.statusCode).toBe(200);

    const payroll = await app.inject({ method: "GET", url: `/api/payroll?period=${period}`, cookies: { sessionId: ownerCookie } });
    const mechRow = payroll.json().rows.find((r: { staffId: number; staffType: string }) => r.staffType === "mechanic" && r.staffId === mechanicId);
    expect(mechRow.profitCents).toBeGreaterThanOrEqual(50000); // full labour charge counts as profit, no cost of goods
    expect(mechRow.commission.commissionCents).toBe(Math.round(mechRow.profitCents * 0.20));
  });

  it("rejects a bad period format", async () => {
    const res = await app.inject({ method: "GET", url: "/api/payroll?period=notamonth", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(400);
  });
});

describe("advances and payslip generation", () => {
  it("records an advance and deducts it from that month's net pay only", async () => {
    const before = await app.inject({ method: "GET", url: `/api/payroll?period=${period}`, cookies: { sessionId: ownerCookie } });
    const beforeRow = before.json().rows.find((r: { staffId: number; staffType: string }) => r.staffType === "mechanic" && r.staffId === mechanicId);

    const adv = await app.inject({
      method: "POST", url: "/api/advances", cookies: { sessionId: ownerCookie },
      payload: { staffType: "mechanic", staffId: mechanicId, amountCents: 10000, period, note: "fuel" },
    });
    expect(adv.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: `/api/payroll?period=${period}`, cookies: { sessionId: ownerCookie } });
    const afterRow = after.json().rows.find((r: { staffId: number; staffType: string }) => r.staffType === "mechanic" && r.staffId === mechanicId);
    expect(afterRow.netCents).toBe(beforeRow.netCents - 10000);
  });

  it("pays a payslip and then freezes that month's net pay even if new sales happen later", async () => {
    const pay = await app.inject({
      method: "POST", url: `/api/payroll/mechanic/${mechanicId}/pay`, cookies: { sessionId: ownerCookie },
      payload: { period },
    });
    expect(pay.statusCode).toBe(200);
    const paidNet = pay.json().payslip.netCents;

    // A brand-new sale this same month should NOT change the already-paid payslip's net.
    await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [], services: [{ description: "Tune-up", amount: 999999, mechanicId }], paymentMethod: "cash", cashReceivedCents: 999999 },
    });

    const after = await app.inject({ method: "GET", url: `/api/payroll?period=${period}`, cookies: { sessionId: ownerCookie } });
    const row = after.json().rows.find((r: { staffId: number; staffType: string }) => r.staffType === "mechanic" && r.staffId === mechanicId);
    expect(row.paid).toBe(true);
    expect(row.netCents).toBe(paidNet);
  });

  it("rejects paying the same staff member twice for the same month", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/payroll/mechanic/${mechanicId}/pay`, cookies: { sessionId: ownerCookie },
      payload: { period },
    });
    expect(res.statusCode).toBe(400);
  });
});
