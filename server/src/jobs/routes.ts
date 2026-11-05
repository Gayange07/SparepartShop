import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { JobInput } from "shared";
import { findCustomerIdByPhone } from "../customers/match.js";
import { db } from "../db/client.js";
import { serviceJobs, jobServices, jobParts, customers, parts, partGrades, mechanics } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";
import { nextSeq } from "../sequence.js";

function jobWithLines(id: number) {
  const job = db.select().from(serviceJobs).where(eq(serviceJobs.id, id)).get();
  if (!job) return null;
  const services = db.select().from(jobServices).where(eq(jobServices.jobId, id)).all();
  const lineParts = db.select().from(jobParts).where(eq(jobParts.jobId, id)).all().map((jp) => {
    const part = db.select().from(parts).where(eq(parts.id, jp.partId)).get();
    return { ...jp, partNo: part?.partNo ?? "", name: part?.name ?? "" };
  });
  const customer = job.customerId ? db.select().from(customers).where(eq(customers.id, job.customerId)).get() : null;
  const mechanic = job.mechanicId ? db.select().from(mechanics).where(eq(mechanics.id, job.mechanicId)).get() : null;
  const estimateCents = services.reduce((s, v) => s + v.priceCents * v.qty, 0)
    + lineParts.reduce((s, p) => {
      const grade = db.select().from(partGrades).where(eq(partGrades.partId, p.partId)).all().find((g) => g.grade === p.grade);
      return s + p.qty * (grade?.priceCents ?? 0);
    }, 0);
  return { job, services, parts: lineParts, customer, mechanic, estimateCents };
}

export default async function jobsRoutes(app: FastifyInstance) {
  app.get("/api/jobs", { preHandler: app.requireAuth }, async (req) => {
    const { status } = req.query as { status?: "open" | "billed" | "cancelled" };
    let rows = db.select().from(serviceJobs).all();
    if (status) rows = rows.filter((j) => j.status === status);
    rows.sort((a, b) => b.id - a.id);
    return { jobs: rows.map((j) => jobWithLines(j.id)) };
  });

  app.get("/api/jobs/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const result = jobWithLines(id);
    if (!result) return reply.code(404).send({ error: "Job not found" });
    reply.send(result);
  });

  app.post("/api/jobs", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = JobInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    for (const line of input.parts) {
      const part = db.select().from(parts).where(eq(parts.id, line.partId)).get();
      if (!part) return reply.code(400).send({ error: `Part ${line.partId} not found` });
      const grade = db.select().from(partGrades).where(eq(partGrades.partId, line.partId)).all().find((g) => g.grade === line.grade);
      if (!grade || grade.priceCents === null) return reply.code(400).send({ error: `${part.name} (${line.grade}) is not carried` });
      if (line.qty > grade.qty) return reply.code(400).send({ error: `Only ${grade.qty} of ${part.name} (${line.grade}) in stock` });
    }

    const now = new Date().toISOString();

    const job = db.transaction((tx) => {
      const jobNo = nextSeq("JOB", serviceJobs, undefined, tx);

      let customerId = input.customerId ?? findCustomerIdByPhone(input.customerPhone);
      if (!customerId) {
        const [created] = tx.insert(customers).values({
          name: input.customerName.trim(), phone: input.customerPhone.trim(), vehicleNo: input.vehicleNo.trim(),
          createdAt: now,
        }).returning().all();
        customerId = created.id;
      }

      const [created] = tx.insert(serviceJobs).values({
        jobNo, customerId, vehicleNo: input.vehicleNo, model: input.model,
        mechanicId: input.mechanicId, note: input.note, status: "open",
        createdBy: user.id, createdAt: now,
      }).returning().all();

      for (const s of input.services) {
        tx.insert(jobServices).values({ jobId: created.id, serviceListId: s.serviceListId, name: s.name, priceCents: s.priceCents, qty: s.qty }).run();
      }
      for (const p of input.parts) {
        tx.insert(jobParts).values({ jobId: created.id, partId: p.partId, grade: p.grade, qty: p.qty }).run();
      }
      return created;
    });

    logActivity({ userId: user.id, action: "job_created", entityType: "service_job", entityId: job.id, details: { jobNo: job.jobNo } });
    reply.send(jobWithLines(job.id));
  });

  app.put("/api/jobs/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const existing = db.select().from(serviceJobs).where(eq(serviceJobs.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Job not found" });
    if (existing.status === "billed") return reply.code(400).send({ error: "This job has already been billed" });
    if (existing.status === "cancelled") return reply.code(400).send({ error: "This job is cancelled and cannot be edited" });

    const parsed = JobInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const input = parsed.data;

    for (const line of input.parts) {
      const part = db.select().from(parts).where(eq(parts.id, line.partId)).get();
      if (!part) return reply.code(400).send({ error: `Part ${line.partId} not found` });
      const grade = db.select().from(partGrades).where(eq(partGrades.partId, line.partId)).all().find((g) => g.grade === line.grade);
      if (!grade || grade.priceCents === null) return reply.code(400).send({ error: `${part.name} (${line.grade}) is not carried` });
      if (line.qty > grade.qty) return reply.code(400).send({ error: `Only ${grade.qty} of ${part.name} (${line.grade}) in stock` });
    }

    db.update(serviceJobs).set({
      vehicleNo: input.vehicleNo, model: input.model, mechanicId: input.mechanicId, note: input.note,
    }).where(eq(serviceJobs.id, id)).run();

    db.delete(jobServices).where(eq(jobServices.jobId, id)).run();
    db.delete(jobParts).where(eq(jobParts.jobId, id)).run();
    for (const s of input.services) {
      db.insert(jobServices).values({ jobId: id, serviceListId: s.serviceListId, name: s.name, priceCents: s.priceCents, qty: s.qty }).run();
    }
    for (const p of input.parts) {
      db.insert(jobParts).values({ jobId: id, partId: p.partId, grade: p.grade, qty: p.qty }).run();
    }

    logActivity({ userId: user.id, action: "job_updated", entityType: "service_job", entityId: id, details: { jobNo: existing.jobNo } });
    reply.send(jobWithLines(id));
  });

  app.post("/api/jobs/:id/cancel", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const job = db.select().from(serviceJobs).where(eq(serviceJobs.id, id)).get();
    if (!job) return reply.code(404).send({ error: "Job not found" });
    if (job.status === "billed") return reply.code(400).send({ error: "This job has been billed. Void the sale first, then cancel the job." });
    if (job.status === "cancelled") return reply.code(400).send({ error: "This job is already cancelled" });

    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) return reply.code(400).send({ error: "A reason is required to cancel a job" });

    const now = new Date().toISOString();
    db.update(serviceJobs).set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: user.id,
      cancelReason: reason.trim(),
    }).where(eq(serviceJobs.id, id)).run();

    logActivity({
      userId: user.id, action: "job_cancelled", entityType: "service_job", entityId: id,
      details: { jobNo: job.jobNo, reason: reason.trim() },
    });
    reply.send({ ok: true });
  });

  app.delete("/api/jobs/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    const id = Number((req.params as { id: string }).id);
    const job = db.select().from(serviceJobs).where(eq(serviceJobs.id, id)).get();
    if (!job) return reply.code(404).send({ error: "Job not found" });

    db.delete(jobServices).where(eq(jobServices.jobId, id)).run();
    db.delete(jobParts).where(eq(jobParts.jobId, id)).run();
    db.delete(serviceJobs).where(eq(serviceJobs.id, id)).run();

    logActivity({ userId: user.id, action: "job_deleted", entityType: "service_job", entityId: id, details: { jobNo: job.jobNo } });
    reply.send({ ok: true });
  });
}
