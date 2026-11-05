import { describe, expect, it, beforeAll } from "vitest";
import { hash } from "argon2";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.DB_PATH = ":memory:";
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

let app: ReturnType<typeof Fastify>;
let ownerCookie: string;
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
  const preOrdersRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values({
    name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now,
  }).run();
  const [part] = db.insert(schema.parts).values({
    partNo: "PRE-001", name: "Crash guard", manufacturer: "Bajaj", category: "Body",
    vehicleType: "Motorcycle", rack: "C1", models: ["Pulsar 150"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  db.insert(schema.partGrades).values({ partId: part.id, grade: "GEN", costCents: 3000, priceCents: 4800, qty: 0, reorderLevel: 2 }).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(preOrdersRoutes);

  ownerCookie = await login("admin", "12345");
});

describe("POST /api/preorders", () => {
  it("creates a pre-order and creates a new customer", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/preorders", cookies: { sessionId: ownerCookie },
      payload: {
        customerName: "Dinesh", customerPhone: "0759586580", vehicle: "Yamaha FZ",
        partId, grade: "GEN", qty: 1, partDescription: "Crash guard set",
        advancePaidCents: 100000, orderDate: "2026-11-01", promisedDate: "2026-11-10",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.preOrderNo).toMatch(/^PRE-\d{5}$/);
    expect(body.status).toBe("pending");
    expect(body.customer.name).toBe("Dinesh");
  });

  it("rejects a pre-order without a promised date", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/preorders", cookies: { sessionId: ownerCookie },
      payload: { customerName: "X", customerPhone: "077", partDescription: "Something", orderDate: "2026-11-01", promisedDate: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/preorders/:id/status", () => {
  it("updates status and logs the change", async () => {
    const create = await app.inject({
      method: "POST", url: "/api/preorders", cookies: { sessionId: ownerCookie },
      payload: { customerName: "Y", customerPhone: "077", partDescription: "Speedo cable", orderDate: "2026-11-01", promisedDate: "2026-11-05" },
    });
    const id = create.json().id;
    const res = await app.inject({ method: "POST", url: `/api/preorders/${id}/status`, cookies: { sessionId: ownerCookie }, payload: { status: "arrived" } });
    expect(res.statusCode).toBe(200);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const row = db.select().from(schema.preOrders).where(eq(schema.preOrders.id, id)).get();
    expect(row?.status).toBe("arrived");

    const log = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "preorder_status_changed")).all();
    expect(log.length).toBeGreaterThan(0);
  });
});

describe("GET /api/preorders", () => {
  it("filters by status", async () => {
    const res = await app.inject({ method: "GET", url: "/api/preorders?status=pending", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().preOrders.every((p: { status: string }) => p.status === "pending")).toBe(true);
  });
});
