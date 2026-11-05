import { buildApp } from "./app.js";
import { startNightlyBackups } from "./backup/service.js";

const app = buildApp();
const port = Number(process.env.PORT ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.log(`Server listening on http://localhost:${port}`);
    startNightlyBackups((path) => console.log(`[backup] nightly snapshot saved: ${path}`));
  });
