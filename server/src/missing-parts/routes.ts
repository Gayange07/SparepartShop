import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { missingParts } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

const MissingPartInput = z.object({
  description: z.string().min(1, "Describe the part"),
  manufacturer: z.string().default(""),
  model: z.string().default(""),
  category: z.string().default(""),
  customerName: z.string().default(""),
  customerPhone: z.string().default(""),
  note: z.string().default(""),
});

export default async function missingPartsRoutes(app: FastifyInstance) {
  app.get("/api/missing-parts", { preHandler: app.requireAuth }, async () => {
    const rows = db.select().from(missingParts).all();
    rows.sort((a, b) => b.id - a.id);
    return { missingParts: rows };
  });

  app.post("/api/missing-parts", { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = MissingPartInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

    const [row] = db.insert(missingParts).values({
      ...parsed.data, recordedBy: user.id, createdAt: new Date().toISOString(),
    }).returning().all();
    reply.send({ missingPart: row });
  });

  app.post("/api/missing-parts/:id/status", { preHandler: app.requireOwner }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const parsed = z.object({ status: z.enum(["open", "ordered", "resolved"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    if (!db.select().from(missingParts).where(eq(missingParts.id, id)).get()) return reply.code(404).send({ error: "Missing part not found" });
    db.update(missingParts).set({ status: parsed.data.status }).where(eq(missingParts.id, id)).run();
    reply.send({ ok: true });
  });
}
