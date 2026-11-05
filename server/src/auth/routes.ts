import type { FastifyInstance } from "fastify";
import { verify } from "argon2";
import { eq } from "drizzle-orm";
import { LoginRequest, OwnerPasswordRequest, type SessionUser } from "shared";
import { db } from "../db/client.js";
import { users, settings } from "../db/schema/index.js";
import { logActivity } from "../activity-log.js";

export default async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = LoginRequest.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: parsed.error.issues[0].message });
      return;
    }
    const { username, password } = parsed.data;

    const user = db.select().from(users).where(eq(users.username, username)).get();
    const valid = user ? await verify(user.passwordHash, password) : false;

    if (!user || !valid) {
      logActivity({ userId: null, action: "login_failed", details: { username } });
      reply.code(401).send({ error: "Wrong username or password" });
      return;
    }
    if (!user.active) {
      reply.code(401).send({ error: "Wrong username or password" });
      return;
    }

    const sessionUser: SessionUser = {
      id: user.id, name: user.name, username: user.username,
      role: user.role, canStock: user.canStock, canCost: user.canCost,
    };
    req.session.user = sessionUser;
    logActivity({ userId: user.id, action: "login" });
    reply.send({ user: sessionUser });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    req.session.destroy();
    reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (req, reply) => {
    reply.send({ user: req.session.user ?? null });
  });

  app.post("/api/auth/verify-owner-password", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = OwnerPasswordRequest.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: parsed.error.issues[0].message });
      return;
    }
    const row = db.select().from(settings).get();
    const valid = row ? await verify(row.ownerAuthPasswordHash, parsed.data.password) : false;
    const userId = req.session.user!.id;

    if (!valid) {
      logActivity({ userId, action: "owner_auth_failed" });
      reply.code(401).send({ error: "Wrong authorization password" });
      return;
    }
    logActivity({ userId, action: "owner_auth_ok" });
    reply.send({ ok: true });
  });
}
