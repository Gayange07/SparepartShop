import Fastify from "fastify";
import authPlugin from "./auth/plugin.js";
import authRoutes from "./auth/routes.js";
import partsRoutes from "./parts/routes.js";
import suppliersRoutes from "./suppliers/routes.js";
import customersRoutes from "./customers/routes.js";
import salesRoutes from "./sales/routes.js";
import missingPartsRoutes from "./missing-parts/routes.js";
import mechanicsRoutes from "./mechanics/routes.js";
import settingsRoutes from "./settings/routes.js";
import jobsRoutes from "./jobs/routes.js";
import preOrdersRoutes from "./preorders/routes.js";
import servicePriceListRoutes from "./service-price-list/routes.js";
import staffRoutes from "./staff/routes.js";
import reportsRoutes from "./reports/routes.js";
import backupRoutes from "./backup/routes.js";

export function buildApp() {
  const app = Fastify({ logger: false });

  app.register(authPlugin);
  app.register(authRoutes);
  app.register(partsRoutes);
  app.register(suppliersRoutes);
  app.register(customersRoutes);
  app.register(salesRoutes);
  app.register(missingPartsRoutes);
  app.register(mechanicsRoutes);
  app.register(settingsRoutes);
  app.register(jobsRoutes);
  app.register(preOrdersRoutes);
  app.register(servicePriceListRoutes);
  app.register(staffRoutes);
  app.register(reportsRoutes);
  app.register(backupRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
