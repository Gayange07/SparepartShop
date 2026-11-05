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
let mechanicId: number;

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
  const jobsRoutes = (await import("./routes.js")).default;

  migrate(db, { migrationsFolder });

  const now = new Date().toISOString();
  db.insert(schema.settings).values({ ownerAuthPasswordHash: await hash("99999") }).run();
  db.insert(schema.users).values({
    name: "Gayan", username: "admin", passwordHash: await hash("12345"), role: "owner", canStock: true, canCost: true, createdAt: now,
  }).run();
  const [mech] = db.insert(schema.mechanics).values({ name: "Ruwan", commissionPct: 10, createdAt: now }).returning().all();
  mechanicId = mech.id;

  const [part] = db.insert(schema.parts).values({
    partNo: "JOB-001", name: "Clutch plate", manufacturer: "Bajaj", category: "Engine",
    vehicleType: "Motorcycle", rack: "A1", models: ["Pulsar 150"], createdAt: now, updatedAt: now,
  }).returning().all();
  partId = part.id;
  db.insert(schema.partGrades).values({ partId: part.id, grade: "GEN", costCents: 2000, priceCents: 3000, qty: 5, reorderLevel: 2 }).run();

  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(jobsRoutes);

  ownerCookie = await login("admin", "12345");
});

describe("POST /api/jobs", () => {
  it("creates a job with a service and a part, computing the estimate", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/jobs", cookies: { sessionId: ownerCookie },
      payload: {
        customerName: "Saman", customerPhone: "0771111111", vehicleNo: "AB-1234", model: "Pulsar 150",
        mechanicId, note: "Full service",
        services: [{ name: "Full service", priceCents: 500000, qty: 1 }],
        parts: [{ partId, grade: "GEN", qty: 2 }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.job.jobNo).toMatch(/^JOB-\d{5}$/);
    expect(body.job.status).toBe("open");
    expect(body.estimateCents).toBe(500000 + 2 * 3000); // service + 2 parts at Rs 30 each
  });

  it("reuses the existing customer with the same phone instead of creating a duplicate", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const before = db.select().from(schema.customers).all().length;
    const res = await app.inject({
      method: "POST", url: "/api/jobs", cookies: { sessionId: ownerCookie },
      payload: {
        customerName: "Saman", customerPhone: "077 111 1111", vehicleNo: "AB-1234", model: "Pulsar 150",
        mechanicId, note: "", services: [{ name: "Oil change", priceCents: 100000, qty: 1 }], parts: [],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(db.select().from(schema.customers).all().length).toBe(before);
  });

  it("does not deduct stock when a job is created", async () => {
    const { db } = await import("../db/client.js");
    const schema = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const grade = db.select().from(schema.partGrades).where(eq(schema.partGrades.partId, partId)).all()[0];
    expect(grade.qty).toBe(5); // unchanged — stock only moves when billed at POS
  });

  it("rejects a job with no mechanic", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/jobs", cookies: { sessionId: ownerCookie },
      payload: { customerName: "Saman", services: [{ name: "X", priceCents: 1000, qty: 1 }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a job with neither services nor parts", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/jobs", cookies: { sessionId: ownerCookie },
      payload: { customerName: "Saman", mechanicId },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a part quantity beyond what's in stock", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/jobs", cookies: { sessionId: ownerCookie },
      payload: { customerName: "Saman", mechanicId, parts: [{ partId, grade: "GEN", qty: 999 }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/jobs", () => {
  it("filters by status", async () => {
    const res = await app.inject({ method: "GET", url: "/api/jobs?status=open", cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.jobs.every((j: { job: { status: string } }) => j.job.status === "open")).toBe(true);
  });
});

describe("DELETE /api/jobs/:id", () => {
  it("deletes a job and its lines", async () => {
    const create = await app.inject({
      method: "POST", url: "/api/jobs", cookies: { sessionId: ownerCookie },
      payload: { customerName: "ToDelete", mechanicId, services: [{ name: "X", priceCents: 1000, qty: 1 }] },
    });
    const jobId = create.json().job.id;
    const res = await app.inject({ method: "DELETE", url: `/api/jobs/${jobId}`, cookies: { sessionId: ownerCookie } });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({ method: "GET", url: `/api/jobs/${jobId}`, cookies: { sessionId: ownerCookie } });
    expect(check.statusCode).toBe(404);
  });
});
