import { app, BrowserWindow, shell } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import http from "node:http";

// When DESKTOP_DEV=1 (set by `npm run dev:desktop`), we assume web (5173) + server (4000) are
// already running and just open a window at the Vite dev URL — Vite proxies /api to the server.
//
// When DESKTOP_DEV is unset (the future installer path), we spawn the Fastify server ourselves
// and load its URL. For that path to work, Fastify also needs to serve the built web assets at `/`
// (via @fastify/static over web/dist/). That static-serving wiring belongs in the installer step,
// so right now the non-DEV path is a stub: it spawns the server but the window will show a 404
// at `/` until static serving is added. Kept here so the full shape is visible from day one.
const DEV = process.env.DESKTOP_DEV === "1";
const SERVER_PORT = Number(process.env.PORT ?? 4000);
const WEB_DEV_URL = process.env.WEB_DEV_URL ?? "http://localhost:5173";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let serverProc: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function pingHealth(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((ok, fail) => {
    const tick = () => {
      const req = http.get(`${SERVER_URL}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) ok();
        else if (Date.now() > deadline) fail(new Error(`server returned ${res.statusCode}`));
        else setTimeout(tick, 250);
      });
      req.on("error", () => {
        if (Date.now() > deadline) fail(new Error("server did not come up within 20s"));
        else setTimeout(tick, 250);
      });
      req.setTimeout(500, () => req.destroy());
    };
    tick();
  });
}

function spawnServer() {
  // Dev: run the TypeScript source directly via tsx, same as `npm run dev -w server`.
  // Prod (when a packaged `server/dist/index.js` exists) we would run `node dist/index.js` from
  // the unpacked app resources — that path is wired at the installer step, not here.
  const serverDir = resolve(__dirname, "..", "..", "server");
  // Pin PORT so we agree with SERVER_URL even if the server defaults ever change.
  const env = { ...process.env, PORT: String(SERVER_PORT) };
  // `npx tsx` is portable across Windows/macOS/Linux without a shell: use the actual tsx binary.
  const tsxBin = resolve(__dirname, "..", "..", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  serverProc = spawn(tsxBin, ["src/index.ts"], { cwd: serverDir, env, stdio: "inherit", shell: false, windowsHide: true });
  serverProc.on("exit", (code, signal) => {
    console.log(`[desktop] server exited (code=${code}, signal=${signal})`);
    if (!app.isReady()) return;
    if (mainWindow) mainWindow.close();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#F3F5F4",
    title: "Spare Parts ERP",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links (e.g. mailto, http sites from receipt footers) open in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const url = DEV ? WEB_DEV_URL : SERVER_URL;
  mainWindow.loadURL(url);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function boot() {
  if (!DEV) {
    spawnServer();
    try {
      await pingHealth();
    } catch (err) {
      console.error("[desktop] server failed to start:", err);
      app.quit();
      return;
    }
  }
  createWindow();
}

app.whenReady().then(boot);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill();
  }
});
