import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { ServicePriceListInput } from "shared";
import { db } from "../db/client.js";
import { servicePriceList } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";

export default async function servicePriceListRoutes(app: FastifyInstance) {
  app.get("/api/service-price-list", { preHandler: app.requireAuth }, async () => {
    const rows = db.select().from(servicePriceList).where(eq(servicePriceList.active, true)).all();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { services: rows };
  });

  app.post("/api/service-price-list", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = ServicePriceListInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const [row] = db.insert(servicePriceList).values({ ...parsed.data, active: true }).returning().all();
    logActivity({ userId: user.id, action: "service_price_list_changed", entityType: "service_price_list", entityId: row.id, details: { event: "added", name: row.name } });
    reply.send({ service: row });
  });

  app.put("/api/service-price-list/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const parsed = ServicePriceListInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    db.update(servicePriceList).set(parsed.data).where(eq(servicePriceList.id, id)).run();
    reply.send({ ok: true });
  });

  app.delete("/api/service-price-list/:id", { preHandler: app.requireOwner }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    db.update(servicePriceList).set({ active: false }).where(eq(servicePriceList.id, id)).run();
    reply.send({ ok: true });
  });
}
