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
  const customersRoutes = (await import("./routes.js")).default;
  const salesRoutes = (await import("../sales/routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    { name: "Nimal", username: "nimal", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false, createdAt: now },
  ]).run();
  const [part] = db.insert(schema.parts).values({
    partNo: "CUST-001", name: "Chain", manufacturer: "Bajaj", category: "Transmission",
    vehicleType: "Motorcycle", rack: "B1", models: ["CT100"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  db.insert(schema.partGrades).values({ partId: part.id, grade: "GEN", costCents: 50000, priceCents: 65000, qty: 100, reorderLevel: 2 }).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(customersRoutes);
  await app.register(salesRoutes);

  ownerCookie = await login("admin", "12345");
  shopkeeperCookie = await login("nimal", "1111");
});

describe("POST /api/customers", () => {
  it("creates a customer, letting the owner set a credit limit", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/customers", cookies: { sessionId: ownerCookie },
      payload: { name: "Kamal Garage", phone: "0711234567", creditLimitCents: 1000000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().customer.creditLimitCents).toBe(1000000);
  });

  it("ignores a credit limit sent by a shopkeeper", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/customers", cookies: { sessionId: shopkeeperCookie },
      payload: { name: "Sunil Motors", phone: "0719876543", creditLimitCents: 1000000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().customer.creditLimitCents).toBe(0);
  });
});

describe("PUT /api/customers/:id", () => {
  it("updates customer details", async () => {
    const create = await app.inject({
      method: "POST", url: "/api/customers", cookies: { sessionId: ownerCookie },
      payload: { name: "Ruwan", phone: "0770001111" },
    });
    const id = create.json().customer.id;

    const res = await app.inject({
      method: "PUT", url: `/api/customers/${id}`, cookies: { sessionId: ownerCookie },
      payload: { name: "Ruwan Perera", phone: "0770001111", vehicleNo: "WP-1234", address: "Galle" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().customer.name).toBe("Ruwan Perera");
    expect(res.json().customer.address).toBe("Galle");
  });
});

describe("customer detail, balance, statement and payments", () => {
  it("tracks balance across a credit sale and a payment, and reflects it in the statement", async () => {
    const create = await app.inject({
      method: "POST", url: "/api/customers", cookies: { sessionId: ownerCookie },
      payload: { name: "Credit Customer", phone: "0772223333" },
    });
    const customerId = create.json().customer.id;

    const sale = await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 2 }], paymentMethod: "credit", customerId, ownerAuthPassword: "99999" },
    });
    expect(sale.statusCode).toBe(200);

    const balanceAfterSale = await app.inject({ method: "GET", url: `/api/customers/${customerId}/balance`, cookies: { sessionId: ownerCookie } });
    expect(balanceAfterSale.json().balanceCents).toBe(130000); // 2 x 65000

    const payment = await app.inject({
      method: "POST", url: `/api/customers/${customerId}/payments`, cookies: { sessionId: ownerCookie },
      payload: { amountCents: 50000, method: "cash", note: "Part payment" },
    });
    expect(payment.statusCode).toBe(200);
    expect(payment.json().balanceCents).toBe(80000);
    expect(payment.json().payment.paymentNo).toMatch(/^RCP-\d{5}$/);

    const detail = await app.inject({ method: "GET", url: `/api/customers/${customerId}`, cookies: { sessionId: ownerCookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().balanceCents).toBe(80000);
    expect(detail.json().billsCount).toBe(1);
    expect(detail.json().bought.length).toBe(1);

    const statement = await app.inject({ method: "GET", url: `/api/customers/${customerId}/statement`, cookies: { sessionId: ownerCookie } });
    expect(statement.statusCode).toBe(200);
    const ledger = statement.json().ledger;
    expect(ledger.length).toBe(2);
    expect(ledger[ledger.length - 1].balanceCents).toBe(80000);
  });

  it("rejects a non-positive payment amount", async () => {
    const create = await app.inject({
      method: "POST", url: "/api/customers", cookies: { sessionId: ownerCookie },
      payload: { name: "Zero Pay", phone: "0774445555" },
    });
    const customerId = create.json().customer.id;

    const res = await app.inject({
      method: "POST", url: `/api/customers/${customerId}/payments`, cookies: { sessionId: ownerCookie },
      payload: { amountCents: 0, method: "cash" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/customers", () => {
  it("filters to customers who owe money when owing=1", async () => {
    const create = await app.inject({
      method: "POST", url: "/api/customers", cookies: { sessionId: ownerCookie },
      payload: { name: "Owing Customer", phone: "0775556666" },
    });
    const customerId = create.json().customer.id;
    await app.inject({
      method: "POST", url: "/api/sales", cookies: { sessionId: ownerCookie },
      payload: { lines: [{ partId, grade: "GEN", qty: 1 }], paymentMethod: "credit", customerId, ownerAuthPassword: "99999" },
    });

    const res = await app.inject({ method: "GET", url: "/api/customers?owing=1", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    const rows = res.json().customers;
    expect(rows.some((c: { id: number }) => c.id === customerId)).toBe(true);
    expect(rows.every((c: { balanceCents: number }) => c.balanceCents > 0)).toBe(true);
  });
});
