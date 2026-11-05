import type { FastifyInstance } from "fastify";
import { readFileSync, statSync } from "node:fs";
import { takeBackup, listBackups } from "./service.js";
import { logActivity } from "../activity-log.js";

export default async function backupRoutes(app: FastifyInstance) {
  app.get("/api/backup", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    // Timestamped so the owner's Downloads folder keeps every manual backup separate. Milliseconds
    // included so two clicks within the same second don't produce the same filename.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
    const target = await takeBackup(`shop-manual-${stamp}`);
    const size = statSync(target).size;
    // Shop DBs stay small; readFileSync is simpler than streaming and avoids Fastify-inject races in tests.
    const bytes = readFileSync(target);

    logActivity({ userId: user.id, action: "backup", details: { kind: "manual", bytes: size } });

    reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Length", String(size))
      .header("Content-Disposition", `attachment; filename="shop-${stamp}.db"`)
      .send(bytes);
  });

  app.get("/api/backup/list", { preHandler: app.requireOwner }, async () => {
    return { backups: listBackups().slice(0, 15).map((b) => ({ name: b.name, sizeBytes: b.sizeBytes, createdAt: b.createdAt })) };
  });
}
