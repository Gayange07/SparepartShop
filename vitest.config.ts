import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "web/src/**/*.{test,spec}.ts?(x)",
      "server/src/**/*.{test,spec}.ts",
      "shared/src/**/*.{test,spec}.ts",
    ],
  },
});
