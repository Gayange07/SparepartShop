import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mechanics } from "../db/schema/index.js";

export default async function mechanicsRoutes(app: FastifyInstance) {
  app.get("/api/mechanics", { preHandler: app.requireAuth }, async () => {
    const rows = db.select().from(mechanics).where(eq(mechanics.active, true)).all();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { mechanics: rows.map((m) => ({ id: m.id, name: m.name })) };
  });
}
