import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyPlugin from "fastify-plugin";
import cookie from "@fastify/cookie";
import session from "@fastify/session";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: "stock" | "cost") => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAllPermissions: (permissions: ("stock" | "cost")[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOwner: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance) {
  await app.register(cookie);
  await app.register(session, {
    secret: process.env.SESSION_SECRET ?? "dev-only-secret-change-in-production-00000000",
    cookie: { secure: false, httpOnly: true, sameSite: "lax" },
  });

  app.decorate("requireAuth", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.session.user) {
      reply.code(401).send({ error: "Sign in required" });
    }
  });

  app.decorate("requirePermission", (permission: "stock" | "cost") => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const user = req.session.user;
      if (!user) {
        reply.code(401).send({ error: "Sign in required" });
        return;
      }
      const allowed = user.role === "owner" || (permission === "stock" ? user.canStock : user.canCost);
      if (!allowed) {
        reply.code(403).send({ error: "Not allowed" });
      }
    };
  });

  app.decorate("requireAllPermissions", (permissions: ("stock" | "cost")[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const user = req.session.user;
      if (!user) {
        reply.code(401).send({ error: "Sign in required" });
        return;
      }
      const allowed = user.role === "owner" || permissions.every((p) => (p === "stock" ? user.canStock : user.canCost));
      if (!allowed) {
        reply.code(403).send({ error: "Not allowed" });
      }
    };
  });

  app.decorate("requireOwner", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.session.user || req.session.user.role !== "owner") {
      reply.code(403).send({ error: "Owner only" });
    }
  });
}

export default fastifyPlugin(authPlugin);
