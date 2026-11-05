import type { FastifyInstance } from "fastify";
import { hash, verify } from "argon2";
import { SettingsInput, OwnerAuthPasswordChangeInput } from "shared";
import { db } from "../db/client.js";
import { settings } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";

export default async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", { preHandler: app.requireAuth }, async (req, reply) => {
    const row = db.select().from(settings).get();
    if (!row) return reply.code(500).send({ error: "Shop settings not configured" });
    // Owner-auth password hash and other sensitive fields never leave the server.
    const { ownerAuthPasswordHash: _hash, ...publicSettings } = row;
    reply.send({ settings: publicSettings });
  });

  app.put("/api/settings", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = SettingsInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

    const existing = db.select().from(settings).get();
    if (!existing) return reply.code(500).send({ error: "Shop settings not configured" });

    db.update(settings).set(parsed.data).run();
    logActivity({ userId: user.id, action: "settings_changed", entityType: "settings", entityId: existing.id, details: { shopName: parsed.data.shopName } });

    const row = db.select().from(settings).get()!;
    const { ownerAuthPasswordHash: _hash, ...publicSettings } = row;
    reply.send({ settings: publicSettings });
  });

  app.post("/api/settings/owner-password", { preHandler: app.requireOwner }, async (req, reply) => {
    const user = req.session.user!;
    const parsed = OwnerAuthPasswordChangeInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });

    const row = db.select().from(settings).get();
    if (!row) return reply.code(500).send({ error: "Shop settings not configured" });

    const valid = await verify(row.ownerAuthPasswordHash, parsed.data.currentPassword);
    if (!valid) {
      logActivity({ userId: user.id, action: "owner_auth_failed", details: { context: "owner_password_change" } });
      return reply.code(401).send({ error: "Wrong current authorization password" });
    }

    const newHash = await hash(parsed.data.newPassword);
    db.update(settings).set({ ownerAuthPasswordHash: newHash }).run();
    logActivity({ userId: user.id, action: "owner_auth_ok", details: { context: "owner_password_change" } });
    reply.send({ ok: true });
  });
}
