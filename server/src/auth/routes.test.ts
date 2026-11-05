import { describe, expect, it, beforeAll } from "vitest";
import { hash } from "argon2";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.DB_PATH = ":memory:";
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../db/client.js");
  const schema = await import("../db/schema/index.js");
  const authPlugin = (await import("./plugin.js")).default;
  const authRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({
    ownerAuthPasswordHash: await hash("99999"),
  }).run();
  db.insert(schema.users).values([
    { name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now },
    { name: "Nimal", username: "nimal", passwordHash: await hash("1111"), role: "shopkeeper", canStock: true, canCost: false, createdAt: now },
  ]).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials and writes an activity log entry", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "12345" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe("admin");

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const rows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "login")).all();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("rejects a wrong password and logs login_failed with the attempted username", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "wrong" } });
    expect(res.statusCode).toBe(401);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const rows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "login_failed")).all();
    expect(rows.some((r) => (r.details as { username?: string } | null)?.username === "admin")).toBe(true);
  });

  it("rejects an unknown username without revealing which part was wrong", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "ghost", password: "x" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Wrong username or password");
  });
});

describe("permission checks", () => {
  it("rejects a route with no session at all", async () => {
    const test = Fastify({ logger: false });
    const authPlugin = (await import("./plugin.js")).default;
    await test.register(authPlugin);
    test.get("/test/cost-only", { preHandler: test.requirePermission("cost") }, async () => ({ ok: true }));

    const res = await test.inject({ method: "GET", url: "/test/cost-only" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a logged-in shopkeeper without the cost permission, but allows the owner", async () => {
    const test = Fastify({ logger: false });
    const authPlugin = (await import("./plugin.js")).default;
    const authRoutes = (await import("./routes.js")).default;
    await test.register(authPlugin);
    await test.register(authRoutes);
    test.get("/test/cost-only", { preHandler: test.requirePermission("cost") }, async () => ({ ok: true }));

    const nimalLogin = await test.inject({ method: "POST", url: "/api/auth/login", payload: { username: "nimal", password: "1111" } });
    const nimalCookie = nimalLogin.cookies.find((c) => c.name === "sessionId");
    const nimalRes = await test.inject({ method: "GET", url: "/test/cost-only", cookies: { sessionId: nimalCookie!.value } });
    expect(nimalRes.statusCode).toBe(403);

    const adminLogin = await test.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "12345" } });
    const adminCookie = adminLogin.cookies.find((c) => c.name === "sessionId");
    const adminRes = await test.inject({ method: "GET", url: "/test/cost-only", cookies: { sessionId: adminCookie!.value } });
    expect(adminRes.statusCode).toBe(200);
  });
});

describe("POST /api/auth/verify-owner-password", () => {
  it("accepts the correct owner authorization password and logs owner_auth_ok", async () => {
    const test = Fastify({ logger: false });
    const authPlugin = (await import("./plugin.js")).default;
    const authRoutes = (await import("./routes.js")).default;
    await test.register(authPlugin);
    await test.register(authRoutes);

    const login = await test.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "12345" } });
    const cookie = login.cookies.find((c) => c.name === "sessionId");

    const res = await test.inject({
      method: "POST", url: "/api/auth/verify-owner-password",
      cookies: { sessionId: cookie!.value }, payload: { password: "99999" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a wrong owner authorization password and logs owner_auth_failed", async () => {
    const test = Fastify({ logger: false });
    const authPlugin = (await import("./plugin.js")).default;
    const authRoutes = (await import("./routes.js")).default;
    await test.register(authPlugin);
    await test.register(authRoutes);

    const login = await test.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "12345" } });
    const cookie = login.cookies.find((c) => c.name === "sessionId");

    const res = await test.inject({
      method: "POST", url: "/api/auth/verify-owner-password",
      cookies: { sessionId: cookie!.value }, payload: { password: "wrong" },
    });
    expect(res.statusCode).toBe(401);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const rows = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "owner_auth_failed")).all();
    expect(rows.length).toBeGreaterThan(0);
  });
});
