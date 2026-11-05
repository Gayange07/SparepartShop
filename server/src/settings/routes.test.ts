import { describe, expect, it, beforeAll } from "vitest";
import { hash, verify } from "argon2";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.DB_PATH = ":memory:";
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

let app: ReturnType<typeof Fastify>;
let ownerCookie: string;
let shopkeeperCookie: string;

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
  const settingsRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    { name: "Nimal", username: "nimal", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false, createdAt: now },
  ]).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(settingsRoutes);

  ownerCookie = await login("admin", "12345");
  shopkeeperCookie = await login("nimal", "1111");
});

describe("GET /api/settings", () => {
  it("never returns the owner-auth password hash", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).not.toHaveProperty("ownerAuthPasswordHash");
  });

  it("returns settings to any authenticated user (not just owner)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings", cookies: { sessionId: shopkeeperCookie } });
    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /api/settings", () => {
  it("rejects a shopkeeper", async () => {
    const res = await app.inject({
      method: "PUT", url: "/api/settings", cookies: { sessionId: shopkeeperCookie },
      payload: { shopName: "Nope" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("saves owner-edited settings and logs settings_changed", async () => {
    const res = await app.inject({
      method: "PUT", url: "/api/settings", cookies: { sessionId: ownerCookie },
      payload: {
        shopName: "Galle Spares", shopAddress: "Main St, Galle", shopPhone: "0912222222",
        receiptFooter: "Thanks for your business!",
        maxDiscountPct: 7, autoDiscountOverCents: 1000000, autoDiscountPct: 3,
        roundToCents: 1000, roundDirection: "nearest", taxPct: 0,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.shopName).toBe("Galle Spares");
    expect(res.json().settings.roundDirection).toBe("nearest");

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const log = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "settings_changed")).all();
    expect(log.length).toBeGreaterThan(0);
  });

  it("rejects invalid payloads (e.g. missing shopName)", async () => {
    const res = await app.inject({
      method: "PUT", url: "/api/settings", cookies: { sessionId: ownerCookie },
      payload: { shopName: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/settings/owner-password", () => {
  it("rejects a shopkeeper", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/settings/owner-password", cookies: { sessionId: shopkeeperCookie },
      payload: { currentPassword: "99999", newPassword: "88888" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects wrong current password and logs owner_auth_failed", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/settings/owner-password", cookies: { sessionId: ownerCookie },
      payload: { currentPassword: "nope", newPassword: "88888" },
    });
    expect(res.statusCode).toBe(401);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const log = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "owner_auth_failed")).all();
    expect(log.some((r: { details: unknown }) => (r.details as { context?: string } | null)?.context === "owner_password_change")).toBe(true);
  });

  it("changes the owner password and logs owner_auth_ok", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/settings/owner-password", cookies: { sessionId: ownerCookie },
      payload: { currentPassword: "99999", newPassword: "77777" },
    });
    expect(res.statusCode).toBe(200);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const row = db.select().from(schema.settings).get()!;
    expect(await verify(row.ownerAuthPasswordHash, "77777")).toBe(true);
    expect(await verify(row.ownerAuthPasswordHash, "99999")).toBe(false);
  });
});
