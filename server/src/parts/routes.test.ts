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
  const partsRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    { name: "Nimal", username: "nimal", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false, createdAt: now },
  ]).run();

  const [part] = db.insert(schema.parts).values({
    partNo: "TEST-001", name: "Test part", manufacturer: "Bajaj", category: "Brakes",
    vehicleType: "Motorcycle", rack: "A1", models: ["CT100"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  db.insert(schema.partGrades).values([
    { partId: part.id, grade: "GEN", costCents: 1000, priceCents: 1500, qty: 10, reorderLevel: 3 },
    { partId: part.id, grade: "AA", costCents: 0, priceCents: null, qty: 0, reorderLevel: 3 },
  ]).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(partsRoutes);

  ownerCookie = await login("admin", "12345");
  shopkeeperCookie = await login("nimal", "1111");
});

describe("GET /api/parts", () => {
  it("includes cost prices for the owner", async () => {
    const res = await app.inject({ method: "GET", url: "/api/parts", cookies: { sessionId: ownerCookie } });
    const body = res.json();
    const part = body.parts.find((p: { id: number }) => p.id === partId);
    expect(part.grades.GEN.cost).toBe(1000);
  });

  it("never includes cost prices for a shopkeeper without the cost permission", async () => {
    const res = await app.inject({ method: "GET", url: "/api/parts", cookies: { sessionId: shopkeeperCookie } });
    const body = res.json();
    const part = body.parts.find((p: { id: number }) => p.id === partId);
    expect(part.grades.GEN.cost).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("1000");
  });

  it("treats a null price as not carried", async () => {
    const res = await app.inject({ method: "GET", url: "/api/parts", cookies: { sessionId: ownerCookie } });
    const part = res.json().parts.find((p: { id: number }) => p.id === partId);
    expect(part.grades.AA.price).toBeNull();
  });
});

describe("POST /api/parts/:id/stock", () => {
  it("rejects a stock-out that would push qty below zero", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/parts/${partId}/stock`, cookies: { sessionId: ownerCookie },
      payload: { grade: "GEN", action: "out", qty: 999, note: "damaged" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Stock cannot go below zero");
  });

  it("rejects a stock change without a reason", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/parts/${partId}/stock`, cookies: { sessionId: ownerCookie },
      payload: { grade: "GEN", action: "in", qty: 1, note: "  " },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Give a reason for the stock change");
  });

  it("applies a valid stock-in and records a movement", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/parts/${partId}/stock`, cookies: { sessionId: ownerCookie },
      payload: { grade: "GEN", action: "in", qty: 5, note: "restock" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().qty).toBe(15);

    const moves = await app.inject({ method: "GET", url: `/api/parts/${partId}/movements`, cookies: { sessionId: ownerCookie } });
    expect(moves.json().movements[0].note).toContain("restock");
  });
});

describe("DELETE /api/parts/:id", () => {
  it("deletes a part that has stock movement history without a foreign key error", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const now = new Date().toISOString();
    const [part] = db.insert(schema.parts).values({
      partNo: "DEL-001", name: "Deletable part", manufacturer: "Bajaj", category: "Brakes",
      vehicleType: "Motorcycle", rack: "A1", models: [], createdAt: now, updatedAt: now,
    }).returning().all();
    db.insert(schema.partGrades).values({ partId: part.id, grade: "GEN", costCents: 0, priceCents: 1000, qty: 5, reorderLevel: 2 }).run();
    db.insert(schema.stockMovements).values({ partId: part.id, grade: "GEN", qtyDelta: 5, reason: "adjustment", note: "opening", createdAt: now }).run();

    const res = await app.inject({ method: "DELETE", url: `/api/parts/${part.id}`, cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /api/parts/:id price changes", () => {
  it("logs a price_change activity entry when the selling price changes", async () => {
    const res = await app.inject({
      method: "PUT", url: `/api/parts/${partId}`, cookies: { sessionId: ownerCookie },
      payload: {
        partNo: "TEST-001", name: "Test part", manufacturer: "Bajaj", category: "Brakes",
        vehicleType: "Motorcycle", rack: "A1", models: ["CT100"],
        grades: { GEN: { cost: 1000, price: 1800, reorder: 3 }, AA: { price: null, reorder: 3 } },
        supplierNumbers: [],
      },
    });
    expect(res.statusCode).toBe(200);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const rows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "price_change")).all();
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("POST /api/parts/import", () => {
  it("creates a new part and adds to an existing part's stock without replacing it", async () => {
    const csv = [
      "part_no,name,manufacturer,models,category,vehicle,location,genuine_cost,genuine_price,genuine_qty,aa_cost,aa_price,aa_qty,a_cost,a_price,a_qty",
      "TEST-001,Test part,Bajaj,CT100,Brakes,Motorcycle,A1,10,18,5,,,,,,",
      "IMPORT-NEW-01,Imported widget,Honda,Dio,Misc,Motorcycle,B2,5,9,20,,,,,,",
    ].join("\n");

    const res = await app.inject({
      method: "POST", url: "/api/parts/import", cookies: { sessionId: ownerCookie },
      payload: { csv },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.added).toBe(1);
    expect(body.updated).toBe(1);

    const list = await app.inject({ method: "GET", url: "/api/parts", cookies: { sessionId: ownerCookie } });
    const existingPart = list.json().parts.find((p: { partNo: string }) => p.partNo === "TEST-001");
    // qty was 15 after the earlier stock-in test (10 seeded + 5), import adds 5 more → 20, never replaces.
    expect(existingPart.grades.GEN.qty).toBe(20);

    const newPart = list.json().parts.find((p: { partNo: string }) => p.partNo === "IMPORT-NEW-01");
    expect(newPart.grades.GEN.qty).toBe(20);
    expect(newPart.grades.GEN.price).toBe(900);
  });

  it("rejects CSV missing the required columns", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/parts/import", cookies: { sessionId: ownerCookie },
      payload: { csv: "foo,bar\n1,2" },
    });
    expect(res.statusCode).toBe(400);
  });
});
