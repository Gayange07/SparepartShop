import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: true, // reachable from phones on the shop Wi-Fi during development
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
  },
});
