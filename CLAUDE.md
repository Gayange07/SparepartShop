# Spare Parts ERP

ERP for a motorcycle and three-wheeler spare parts shop in Sri Lanka (Galle). Owner + shopkeepers use it daily; mechanics do not log in.
Runs on the shop's counter PC (Windows) as the server; staff phones connect over shop Wi-Fi; the owner monitors remotely.

## Stack
- npm workspaces monorepo, TypeScript strict everywhere
- `web/` React 19 + Vite + Tailwind CSS 4 + shadcn/ui (restyled with the Workshop theme), Lucide icons, React Hook Form + Zod, TanStack Table, shadcn charts
- `server/` Fastify + SQLite (better-sqlite3) + Drizzle ORM, server sessions, Argon2 password hashing, Server-Sent Events for live updates
- `shared/` Zod schemas and business-rule functions used by BOTH web and server
- `desktop/` Electron (later): starts the server, installer, auto-update, silent receipt printing
- Tests: Vitest for business rules and API routes
- Remote access: Cloudflare Tunnel + Access. Backups: nightly SQLite copy to USB + Google Drive

## Commands
- `npm install` (root) · `npm run dev` (web + server together) · `npm test` · `npm run build`
- `npm run db:migrate` · `npm run db:seed` (demo data, same as the v3 demo)

## Blueprint
`docs/blueprint/SpareParts-ERP-v3.html` is the approved working prototype (single file, offline). Every screen, flow and rule there was agreed with the owner.
When building a screen, open the matching part of v3 first and match its behaviour. `docs/react-demo/` holds the first React screens to reuse.

## Business rules (enforce on the SERVER, mirror in the UI)
- Every part has up to 3 grades: Genuine (GEN), AA, A. Each grade has its own cost, selling price, qty and reorder level. A grade with no selling price is "not carried".
- Our part number is unique. Parts also store each supplier's own part number; searching by a supplier's number finds our part.
- Part fields: manufacturer, models (list), category, vehicle type, rack. POS search = text OR Manufacturer → Model → Category.
- Cost prices are visible ONLY to the owner or staff with the `cost` permission. Never send cost fields in API responses to others.
- Staff permissions: `stock` (add parts, change stock & selling prices), `cost` (see/enter cost). Owner has all.
- Money: store as integer cents (LKR × 100). Never use floats for money in the DB.
- Discount is a percentage. Staff max % = setting (default 5). Owner unlimited.
- Big-bill auto discount: if subtotal ≥ setting (default Rs 5,000) apply auto % (default 5) unless staff unticks it.
- "Round off" checkbox per bill: round total down to Rs 10 (setting: step 5/10/50/100, down or nearest).
- Credit sales and voiding bills require the Owner Authorization Password (separate from login passwords). Log failed attempts.
- A sale, stock change, void, price/cost change, credit approval, payment, login and failed login are ALWAYS written to the activity log with user + time.
- Invoice numbers: INV-00001 sequence; also JOB-, PRE-, GRN-, RCP-, SPY-, RET-.
- Profit = total − tax − cost of parts sold. Commissions are % of profit (shopkeeper: bills they made; mechanic: jobs they did) + optional monthly target bonus.
- Pre-orders show red when the promised date is ≤ 2 days away or passed.
- Customer credit balance = credit bills (total − paid) − payments. Supplier balance = GRN totals − paid − payments − returns.
- Stock never goes below zero. Every stock change writes a stock movement row with reason.
- Dates in Asia/Colombo time. Currency shown as "Rs. 1,234.00".

## Roles & screens
Owner: everything. Shopkeeper: Dashboard (own), New sale, Service jobs, Pre-orders, Missing parts, Inventory (no cost), Customers, own Sales history.
Owner only: Suppliers & receiving stock, Staff & payroll, Reports, Activity log, Settings.

## Design (Workshop theme — keep it)
- Colours: background #F3F5F4, card #FFFFFF, text #24292D, muted #66707A, border #E1E5E3, primary teal #1B6B63, red #B23E2C (low stock / owed only), amber #9A6A0E (warnings).
- Grades: Genuine green #2D7650, AA blue #3B5794, A ochre #8C6214 (soft tints for chips).
- Fonts: system UI for body; "Heros Cn" (embedded, condensed) for headings, part numbers and money.
- Phone first: bottom tab bar (Home, Sell, Jobs, Stock, More), dialogs become bottom sheets, tables become stacked rows, POS has Find parts / Bill tabs and a torn-receipt total bar.
- Thin borders, almost no shadows, sentence-case labels, plain words. No all-caps labels.

## Conventions
- Small, focused files. Pages in `web/src/pages`, UI kit in `web/src/components/ui`.
- Validate every request body with the shared Zod schema.
- Write a Vitest test for every business rule in `shared/` before using it.
- Keep the UI copy simple English; staff are not technical.
- Commit after each working step with a clear message.
