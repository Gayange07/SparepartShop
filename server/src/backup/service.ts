import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { sqlite, DB_PATH } from "../db/client.js";

const BACKUP_DIR = process.env.BACKUP_DIR ?? join(dirname(resolve(DB_PATH)), "..", "backups");
const KEEP_DAYS = 7;

mkdirSync(BACKUP_DIR, { recursive: true });

/** Produces a safe, consistent snapshot of the live WAL-mode database to {name}.db in BACKUP_DIR. Returns the full path. */
export async function takeBackup(baseName: string = backupNameForToday()): Promise<string> {
  const target = join(BACKUP_DIR, `${baseName}.db`);
  // better-sqlite3's db.backup() is the only safe way to copy a WAL-mode database without a race.
  await sqlite.backup(target);
  pruneOldBackups();
  return target;
}

export function listBackups(): { name: string; path: string; sizeBytes: number; createdAt: string }[] {
  if (!statSafe(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const p = join(BACKUP_DIR, f);
      const s = statSync(p);
      return { name: f, path: p, sizeBytes: s.size, createdAt: s.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function backupNameForToday(): string {
  return `shop-${new Date().toISOString().slice(0, 10)}`;
}

function statSafe(p: string) { try { return statSync(p); } catch { return null; } }

function pruneOldBackups() {
  const all = listBackups();
  const nightlies = all.filter((b) => /^shop-\d{4}-\d{2}-\d{2}\.db$/.test(b.name));
  if (nightlies.length <= KEEP_DAYS) return;
  for (const old of nightlies.slice(KEEP_DAYS)) {
    try { unlinkSync(old.path); } catch { /* ignore */ }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Starts the nightly backup loop. First backup runs at the next 2 AM Asia/Colombo local time, then every 24h. */
export function startNightlyBackups(onBackup?: (path: string) => void) {
  // Compute ms until next 02:00 local time.
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setTime(next.getTime() + DAY_MS);
  const delay = next.getTime() - Date.now();

  const run = async () => {
    try {
      const path = await takeBackup();
      onBackup?.(path);
    } catch (err) {
      console.error("[backup] nightly backup failed:", err);
    }
  };
  setTimeout(() => { void run(); setInterval(() => void run(), DAY_MS); }, delay);
}
