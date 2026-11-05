---
name: seed-inventory
description: Wipe the shop's current (demo) inventory and load the researched Sri Lankan opening-stock catalogue (337 parts, Genuine/AA/A grades, quantities, prices, model fitment). Use only when the user runs /seed-inventory or explicitly asks to reset and reload the inventory.
disable-model-invocation: true
---

# Seed inventory: replace current stock with the opening catalogue

You are replacing every part currently in this ERP's inventory with the catalogue in `data/`.
This is a destructive operation on real business data. Work carefully, show a plan first, and never delete anything outside the inventory tables without explicit permission.

## The data (in this skill's `data/` folder)

| File | What it holds |
|---|---|
| `parts.json` | 337 parts. One object per part (one part + one model group). Fields below. |
| `categories.json` | 25 categories: `{ code, name }`. The first 20 are used by parts; the rest are reserved. |
| `models.json` | Make/model master by manufacturer and vehicle type, with Sri Lankan distributor. Use it to fill the make → model → category search lists and the customer vehicle lists. |
| `meta.json` | Expected totals for verification and the pricing assumptions. |

Each part in `parts.json`:
```jsonc
{
  "partNo": "BJC-BRK-001",          // our part number, unique. Format: <modelGroup>-<categoryCode>-<seq>
  "name": "Brake shoe set - rear",
  "category": "Brakes",              // matches categories.json name
  "manufacturer": "Bajaj",           // "Universal" for parts that fit many makes
  "models": ["CT100", "Platina 100"],// fitment list
  "fitsLabel": "Bajaj CT100 / Platina",
  "vehicle": "Motorcycle",           // Motorcycle | Three-wheeler | Both  (scooters count as Motorcycle)
  "vehicleClass": "Scooter",         // finer label: Motorcycle | Scooter | Three-wheeler | All
  "unit": "Set",                     // Piece | Set | Kit | Pair | Litre | Bottle | Can | Tin
  "sells": "Fast",                   // Fast | Medium | Slow
  "brandItem": false,                // true = bought by brand (oil, plugs, tyres...). Only the GEN grade is filled.
  "grades": {                        // GEN = Genuine. Prices in RUPEES (convert to cents: × 100)
    "GEN": { "priceRs": 1290, "costRs": 970, "qty": 3, "reorder": 2 },
    "AA":  { "priceRs": 770,  "costRs": 580, "qty": 6, "reorder": 3 },
    "A":   { "priceRs": 540,  "costRs": 410, "qty": 1, "reorder": 1 }
  },
  "priceSource": "DPMC Bajaj genuine parts", "priceSourceUrl": "https://…",
  "priceEstimated": false,           // true = no online price was found; owner must confirm
  "rack": ""
}
```

## Rules (do not break these)

1. **Plan first.** Before changing anything, inspect the project and show the user a short plan (step 1). Wait for "go ahead".
2. **Back up first.** Copy the SQLite database file to `backups/before-seed-inventory-<YYYYMMDD-HHmm>.sqlite` and confirm the copy exists and is the same size before deleting anything.
3. **Only the inventory is replaced.** You may delete: parts, part grades/stock, supplier part numbers, stock movements, part categories, model/fitment tables. **Never** touch users, settings, passwords, customers, suppliers, payments, staff or the activity log.
4. **Sales history protection.** If any sales, service jobs, pre-orders, GRNs or returns reference existing parts, STOP and ask the user which they want:
   - (a) keep history: keep the referenced old parts but mark them inactive/archived and hide them from search, then add the new catalogue; or
   - (b) the data is only demo/test data: also clear those transactions (list exactly which tables and row counts first); or
   - (c) cancel.
   Do not guess.
5. **One transaction.** All deletes and inserts run in a single database transaction. If anything fails, roll back and report the error.
6. **Money as integer cents.** `priceRs` and `costRs` × 100. Never store floats.
7. **Server-side rules still apply.** Cost fields stay owner/`cost`-permission only. Do not add any API route or field that exposes cost to other users.
8. **Grades.** Create GEN, AA and A for graded parts. For `brandItem: true` parts create only GEN (selling price set, AA/A not carried: no selling price).
9. **Opening stock is traceable.** For every grade with `qty > 0`, write a stock movement: `+qty`, reason `Opening stock (catalogue seed)`, user = the logged-in owner or `System`.
10. **Write to the activity log** once: action `Inventory reset and seeded`, details with counts (parts, grade rows, total qty, total cost).
11. **Keep `priceEstimated` and `priceSource`.** If the schema has no place for them, add nullable columns via a Drizzle migration (`price_estimated` boolean, `price_source` text, `price_source_url` text, `unit` text, `sells` text, `brand_item` boolean, `vehicle_class` text). Do not drop existing columns.
12. Follow CLAUDE.md for everything else (naming, Zod validation in `shared/`, tests with Vitest, Workshop design).

## Steps

### 1. Inspect and plan (no changes yet)
- Read CLAUDE.md, the Drizzle schema, existing seed scripts and the inventory API.
- Count current rows in every inventory table and in every table that references parts.
- Map each field in `parts.json` to the schema (show the mapping as a short table). List any missing columns you will add.
- Show the plan, the counts, and any rule-4 question. **Wait for approval.**

### 2. Back up
Copy the database file as in rule 2. Print the backup path.

### 3. Write a reusable seed script
- Copy `data/*.json` into `server/src/db/seeds/catalogue/` so the repo owns the data.
- Create `server/src/db/seeds/inventory.ts` that:
  - validates every part with a Zod schema in `shared/` (`CatalogueGradeSchema`, `CataloguePartSchema`); abort with the failing `partNo` on any error;
  - with `--reset --yes`: deletes the inventory tables (respecting the answer to rule 4), then inserts categories, models/fitment, parts, grades and opening stock movements in one transaction;
  - without `--reset`: inserts only parts whose `partNo` does not exist yet (safe re-run);
  - prints a summary: parts, grade rows, total qty, total cost (Rs), estimated-price parts.
- Add root scripts: `"db:seed:inventory": "tsx server/src/db/seeds/inventory.ts"` and `"db:seed:inventory:reset": "tsx server/src/db/seeds/inventory.ts --reset --yes"`.
- Update the existing demo seed (`db:seed`) so it uses this catalogue for parts instead of the old demo parts.

### 4. Run it
Run `npm run db:seed:inventory:reset`.

### 5. Verify (must all pass)
Compare with `data/meta.json`:
- parts = **337**, grade rows = **949**, total opening qty = **1,337**
- total stock cost = **Rs 1,531,660** (sum of `costRs × qty`)
- estimated-price parts = **70**
- every `partNo` unique; no grade with negative qty; brand items have only GEN
Add a Vitest test `server/test/seed-inventory.test.ts` that seeds a temporary database and asserts these numbers, plus one check that the parts API response for a shopkeeper contains **no cost fields**.

### 6. Check the screens
Start the app and confirm:
- Inventory shows 337 parts; filter "Low stock" works; owner sees cost, `nimal` (shopkeeper) does not.
- POS: Manufacturer **Bajaj** → Model **CT100** → Category **Brakes** shows "Brake shoe set - rear" with Genuine / AA / A buttons and prices.
- Three-wheeler: search "Bajaj RE" lists brake shoe kits, oil filters, gasket sets.
- Parts with `priceEstimated: true` show a small "price to confirm" badge for the owner only (add it if missing; Workshop amber chip).

### 7. Finish
- Commit: `feat(inventory): replace demo stock with Sri Lanka opening catalogue (337 parts)`.
- Report to the user in plain words:
  - what was deleted (table: rows) and the backup file path
  - what was added (the verification numbers)
  - "70 parts have estimated prices. Inventory → filter 'price to confirm' to update them from your supplier quotes."
  - how to undo: restore the backup file.

## If something goes wrong
- Transaction failed → nothing changed; show the error and the failing `partNo`.
- Numbers don't match meta.json → do not commit; show the difference by category.
- Never "fix" a mismatch by editing `parts.json`; ask the user.
