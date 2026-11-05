import "@fastify/session";
import type { SessionUser } from "shared";

declare module "@fastify/session" {
  interface FastifySessionObject {
    user?: SessionUser;
  }
}
