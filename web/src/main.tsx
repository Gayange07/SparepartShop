/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import "./fonts.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);

// PWA: register the service worker so the app installs on phones and shows an offline page when Wi-Fi drops.
// Skipped in dev to avoid caching the Vite HMR shell.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[sw] registration failed:", err));
  });
}
