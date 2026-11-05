# Spare Parts ERP — React front end (demo stage)

Screens for the motorcycle & three-wheeler spare parts shop, built with the agreed stack:
**React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui pattern**, styled with the Workshop theme.

## Run it
```bash
npm install
npm run dev        # open the printed address; phones on the same Wi-Fi can use the "Network" address
npm run build      # production build into dist/
```
Demo login: **admin / 12345**

## What's in here
| Folder | What it is |
|---|---|
| `src/components/ui/` | Our component kit (shadcn pattern: Button, Card, Badge, Input/Select, Sheet, DataTable, Segmented, Toast). We own this code. |
| `src/components/` | App pieces: `app-shell` (sidebar on desktop, tab bar on phones), `grade-button`, `sales-chart` |
| `src/pages/` | Screens: login, dashboard, POS (new sale), inventory, service jobs |
| `src/lib/data.ts` | Zod schemas (shared with the server later) + demo data |
| `src/styles.css` | Workshop theme: colours, fonts, grade colours mapped to shadcn tokens |
| `build.mjs` | Sandbox-only build used to make the single-file demo. Not needed with Vite. |

## Next steps (from the plan)
1. Fastify server + SQLite (Drizzle) with logins and roles checked on the server
2. Remaining screens: pre-orders, missing parts, customers & credit, sales history, suppliers, staff & payroll, reports, settings
3. Electron wrapper: installer, auto-start, silent receipt printing
4. Cloudflare Tunnel + Access for remote monitoring; nightly backups

Note: shadcn's Radix-based Dialog/Select are replaced here by lightweight versions so the demo builds offline.
When `npm install` is available, swap in the official `npx shadcn add dialog drawer select table` components.
