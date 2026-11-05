# Build plan — Spare Parts ERP in Claude Code (VS Code)

Work one step at a time. For each step:
1. Open a **new Claude Code conversation** (keeps it focused).
2. Paste the prompt. Let Claude **show a plan first**, read it, then say "go ahead".
3. Test it yourself in the browser (and on your phone for screens).
4. When it works: ask Claude to **commit** ("commit this step").
5. Tick the box below.

If something is wrong, just describe it in plain words: "the total is wrong when I tick round off".
If Claude repeats a mistake twice, say "add this rule to CLAUDE.md".

---

## Step 0 — Set up your computer (once)

- [ ] Install **Node.js LTS** from nodejs.org (restart VS Code after)
- [ ] Install **Git** from git-scm.com
- [ ] In VS Code: Extensions (Ctrl+Shift+X) → search **Claude Code** → Install → sign in with your Claude account
- [ ] Create a folder `D:\Projects\spareparts-erp` and open it in VS Code (File → Open Folder)
- [ ] Copy into it: `CLAUDE.md`, `BUILD-PLAN.md`
- [ ] Make a folder `docs\blueprint\` and put `SpareParts-ERP-v3.html` in it
- [ ] Unzip `spareparts-erp-react-source.zip` into `docs\react-demo\`
- [ ] Open the Claude Code panel and check it sees the memo: type `/memory` (CLAUDE.md should be listed)

---

## Step 1 — Project skeleton
> Read CLAUDE.md and BUILD-PLAN.md. Set up the npm workspaces monorepo with `web`, `server` and `shared` packages as described. Move the React demo from docs/react-demo into `web` (keep the Workshop theme and components). Add a Fastify server with a /health route, a root `npm run dev` that runs web and server together, Vitest, and a .gitignore. Initialise git and make the first commit. Show me the plan first.

✅ Done when: `npm run dev` opens the demo login and `http://localhost:<server port>/health` says ok.

## Step 2 — Database
> Create the Drizzle + SQLite schema for everything in the v3 blueprint: users (roles, permissions, salary, commission), settings, parts with per-grade stock, supplier part numbers, stock movements, customers, sales + sale items + services, payments, service jobs, pre-orders, missing parts, suppliers, GRNs, supplier payments, returns, advances, payslips, activity log. Money as integer cents. Add migrations and a seed script with the same demo data as v3. Show me the plan first.

✅ Done when: `npm run db:seed` runs and you can open the database file and see parts.

## Step 3 — Logins, roles and the activity log
> Add server-side login with sessions and Argon2 hashing, the Owner Authorization Password check, roles (owner, shopkeeper, mechanic without login) and permissions (stock, cost). Every route checks permissions on the server. Add the activity log writer and log logins and failed logins. Connect the login screen and add the "Can't sign in?" recovery from v3. Write tests. Show me the plan first.

✅ Done when: admin/12345 logs in, nimal/1111 cannot open owner pages, and a wrong password appears in the log.

## Step 4 — Inventory
> Build the inventory API and screens from the blueprint: list with search, make and category filters, low-stock filter, per-grade qty/price, total qty, last changed by; add/edit part (no opening qty, supplier part numbers for owner); stock in/out/count with movements; Excel CSV import. Cost fields only for owner or `cost` permission — never sent to others. Show me the plan first.

## Step 5 — New sale (POS)
> Build the POS from the blueprint and the React demo: make→model→category search, grade buttons, bill with − / + qty, discount %, staff max, big-bill auto discount with untick, round off, cash/card/credit, change to give, customer and vehicle (find existing or create). The server recalculates every total and decreases stock in one database transaction. Credit needs the authorization password. Show the receipt (80mm). Add the "Part not available" → missing parts form. Write tests for the bill maths. Show me the plan first.

## Step 6 — Customers, credit and sales history
> Customers list, history (everything bought, services, pre-orders), credit statement, receive payment with receipt, sales history with filters, view/reprint and void with authorization password (stock goes back). Show me the plan first.

## Step 7 — Service jobs, pre-orders, missing parts
> Service jobs (customer, vehicle, mechanic, services from the owner's price list, parts used, Send to POS), pre-orders (promised date, red when ≤ 2 days, deliver and bill with advance deducted), missing parts list (→ pre-order, mark ordered). Show me the plan first.

## Step 8 — Suppliers (owner only)
> Suppliers, receiving stock (GRN) where typing the supplier's part number finds our part, payables and due dates, payments with cheque number and date, cheques due this week, returns, price comparison, order message for WhatsApp. Show me the plan first.

## Step 9 — Staff, payroll and commissions (owner only)
> Staff details, logins, permissions, salary, commission % of profit, monthly target bonus, advances, monthly payroll with pay slip printing. Show me the plan first.

## Step 10 — Dashboard and reports
> Owner and staff dashboards with live updates (Server-Sent Events). Reports: overview with day-by-day chart, staff & mechanics, services, discounts history, stock analysis (stock more / overstocked / not selling), stock value by make, to-order list, CSV downloads. Show me the plan first.

## Step 11 — Settings, backup, phones
> Settings (shop, receipt, tax, discount rules, rounding, passwords), automatic nightly backup + manual backup/restore, erase data. Make the web app an installable PWA for phones on the shop Wi-Fi. Show me the plan first.

## Step 12 — Desktop app (Electron)
> Wrap it in Electron for the Windows counter PC: starts the server, opens the app, shows the Wi-Fi address for phones, silent printing to the 80mm receipt printer, Windows installer, auto-start, auto-update. Show me the plan first.

## Step 13 — Remote access and go-live
> Set up Cloudflare Tunnel + Access so only the owner's email can open the shop remotely. Write a go-live checklist: erase demo, import real parts from Excel, opening stock count, customer and supplier opening balances, change all passwords. Show me the plan first.

---

### Tips
- Test on your phone during development: phones on the same Wi-Fi can open the "Network" address that `npm run dev` prints.
- Keep each conversation to one step. Start a new one for the next step.
- Before a big change, commit first, so you can always go back.
