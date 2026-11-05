import { describe, expect, it, beforeAll } from "vitest";
import { hash } from "argon2";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.DB_PATH = ":memory:";
// Isolate backups to a temp folder so this test never writes into server/backups/.
process.env.BACKUP_DIR = mkdtempSync(path.join(tmpdir(), "spareparts-backup-test-"));

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
  const backupRoutes = (await import("./routes.js")).default;

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
  await app.register(backupRoutes);

  ownerCookie = await login("admin", "12345");
  shopkeeperCookie = await login("nimal", "1111");
});

describe("GET /api/backup", () => {
  it("rejects a shopkeeper (owner only)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/backup", cookies: { sessionId: shopkeeperCookie } });
    expect(res.statusCode).toBe(403);
  });

  it("returns a real SQLite file for the owner and logs 'backup'", async () => {
    const res = await app.inject({ method: "GET", url: "/api/backup", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(String(res.headers["content-disposition"] ?? "")).toMatch(/attachment; filename="shop-/);
    // SQLite file header is "SQLite format 3\0" (16 bytes, with the trailing NUL).
    const header = res.rawPayload.slice(0, 15).toString("utf8");
    expect(header).toBe("SQLite format 3");
    expect(res.rawPayload[15]).toBe(0);

    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const log = db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "backup")).all();
    expect(log.length).toBeGreaterThan(0);
  });

  it("writes the backup file into BACKUP_DIR", async () => {
    const files = readdirSync(process.env.BACKUP_DIR!).filter((f) => f.endsWith(".db"));
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("GET /api/backup/list", () => {
  it("rejects a shopkeeper (owner only)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/backup/list", cookies: { sessionId: shopkeeperCookie } });
    expect(res.statusCode).toBe(403);
  });

  it("lists recent backups, newest first", async () => {
    // Trigger a second backup so the list has multiple entries to sort.
    await app.inject({ method: "GET", url: "/api/backup", cookies: { sessionId: ownerCookie } });
    const res = await app.inject({ method: "GET", url: "/api/backup/list", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    const { backups } = res.json();
    expect(backups.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < backups.length; i++) expect(backups[i - 1].createdAt >= backups[i].createdAt).toBe(true);
    for (const b of backups) {
      expect(b.sizeBytes).toBeGreaterThan(0);
      expect(b.name).toMatch(/\.db$/);
    }
  });
});
