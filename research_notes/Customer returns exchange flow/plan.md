# Customer returns / exchange flow — grounded research & executable plan

Scope: a POS-embedded return+exchange flow. Policy is fixed (see below). This note gathers evidence from the real codebase and produces a file-by-file plan.

---

## 1. Blueprint check — what v3 already specifies

### Takeaway
The approved v3 prototype only implements **supplier returns** (`supReturns`, `seq('RET')` prefix). There is **no** customer-return/exchange UX in the blueprint — so there is no verbatim UX contract to match. The CLAUDE.md "RET-" sequence prefix is listed, but it is currently used only for returns-to-supplier. We will reuse the same `RET-` number sequence for customer returns (both party-types already share one `returns` table and one `return_no` unique sequence in the real schema).

### Cited Findings
- Blueprint db array (line 333 of `docs/blueprint/SpareParts-ERP-v3.html`) contains `supReturns:[]` and no `custReturns`.
- `supBal` (line 369) subtracts `supReturns` from supplier balance.
- Only one place calls `seq('RET')`, in a supplier-return save (line 928): `const ret={id:uid(),no:seq('RET'),…supId:id,…};db.supReturns.push(ret);`
- Grep for `custReturn|customerReturn|cust_return|exchange|refund|return.*customer` across the full HTML returned zero hits for a customer-return handler, modal, button, or data path (only false positives for JS `return` statements and `supReturns`/`supBal`).
- CLAUDE.md lists the sequence prefixes "`INV-00001 sequence; also JOB-, PRE-, GRN-, RCP-, SPY-, RET-.`" — no separate CRET- prefix.
- CLAUDE.md on returns: *"A sale, stock change, void, price/cost change, credit approval, payment, login and failed login are ALWAYS written to the activity log with user + time."* and the stock rule: *"Stock never goes below zero. Every stock change writes a stock movement row with reason."* and credit math: *"Customer credit balance = credit bills (total − paid) − payments."*

### Inferences
- Because the blueprint is silent on customer returns, this feature is net-new UX; we are free to design the sheet, but it must look and feel like the Workshop theme and the existing `Sheet` / `ServiceChargeSheet` pattern.
- Reusing a single `RET-00001` sequence across supplier+customer returns is already enforced by the schema's `return_no NOT NULL UNIQUE` (migration `0000_minor_viper.sql` lines 316–339) and `nextSeq("RET", returns, undefined, tx)` which does **not** scope the counter by partyType — so a customer return RET-00042 will slot into the same series as supplier RET-00041. Keep it that way; it matches CLAUDE.md.

### Gaps
- None blocking. UX copy for the sheet is a design decision; copy wording is proposed below under §8.

---

## 2. Real returns-table schema state

### Takeaway
The `returns` table in `server/src/db/schema/returns.ts` is **already fully shaped** for customer returns. No column additions are needed. The supplier-return route (`POST /api/suppliers/:id/returns`) is a near-perfect template: same table, same `nextSeq("RET", …)`, same `stockMovements` row with `reason: "return"`, same activity-log action `"return"`. Only the sign and partyType flip.

### Cited Findings
- `server/src/db/schema/returns.ts` columns: `id, returnNo (unique), partyType ("supplier"|"customer"), supplierId, customerId, grnId, saleId, partId, grade, qty, amountCents, reason, createdBy, createdAt`. All six "customer-return" fields the user listed are present.
- Supplier-return reference impl (`server/src/suppliers/routes.ts` lines 197–232):
  - validates `SupplierReturnInput` (shared) — qty/grade/unitCostCents/reason/partId
  - re-reads the `partGrades` row inside a transaction
  - **decrements** partGrades.qty (supplier case: stock leaves the shop)
  - inserts `returns` row with `partyType: "supplier"`
  - inserts a `stockMovements` row with `qtyDelta: -input.qty, reason: "return", refType: "return", refId: row.id`
  - calls `logActivity({ action: "return", entityType: "supplier", … })`
- `stock_movements` enum (`server/src/db/schema/stock-movements.ts` line 10) accepts `reason: "return"` already.
- `activity_log` enum (`server/src/db/schema/activity-log.ts` line 15 and `server/src/activity-log.ts` line 11) accepts `action: "return"` already.
- Returns schema is in the committed migration (`server/drizzle/0000_minor_viper.sql` lines 316–339), **so no new drizzle migration is required** for the schema itself.

### Inferences
- A customer-return route body is a near-mirror of the supplier flow, but **inverted on sign**: `qtyDelta: +input.qty` (stock back in), `partGrades.qty = grade.qty + input.qty`, `partyType: "customer"`, `saleId` set, `customerId` set from the original sale.
- CLAUDE.md's "Stock never goes below zero" rule still applies but automatically holds for a return (we're adding stock, not removing it), so no stock-cap check is needed on return-only submission.

### Gaps
- The schema has no "which sale_items row did this return against" FK. We can either (a) rely on `saleId + partId + grade` to compute "already returned qty for this line" at query time, or (b) add a `sale_item_id` column. **Recommendation: (a)**, since schema is already shipped and the three-tuple is unique within one sale (sale_items doesn't put the same part+grade on two separate lines — the POS cart's `add` merges by `(partId, grade)`, see `web/src/lib/cart.ts` line 15 "already in cart" check). No migration needed.

---

## 3. CLAUDE.md rules that apply

### Takeaway
Four rules force the shape of this feature: (i) owner-auth-password for the >2-day override, (ii) activity log on every state change, (iii) stock movements on every qty change, (iv) cost fields hidden from non-cost users. All four are already enforced by the supplier-return pattern and are easy to carry over.

### Cited Findings (from CLAUDE.md)
- *"Credit sales and voiding bills require the Owner Authorization Password (separate from login passwords). Log failed attempts."* — we extend this to a return of a >2-day-old bill. The server verifies via `argon2.verify(settingsRow.ownerAuthPasswordHash, input.ownerAuthPassword)` exactly like `POST /api/sales/:id/void` (routes.ts lines 240–246).
- *"A sale, stock change, void, price/cost change, credit approval, payment, login and failed login are ALWAYS written to the activity log with user + time."* — the `activityLog` enum already includes `"return"`.
- *"Stock never goes below zero. Every stock change writes a stock movement row with reason."* — on a customer return, `qtyDelta = +qty, reason = "return"`.
- *"Cost prices are visible ONLY to the owner or staff with the `cost` permission."* — the return refund amount is at the original selling price, not cost; so the refund value is safe to show every user. Cost-cents stays guarded as it is today (see `GET /api/sales/:id` in `server/src/sales/routes.ts` lines 212–227 — `canCost` already strips `unitCostCents`).
- *"Discount is a percentage… Big-bill auto discount… Round off…"* — we refund **what the customer paid for the line**, i.e. the sale_item's `unitPriceCents × qty` (no proportional reversal of discount/round-off is required because the user policy is "refund value"; see §5 for a note on the alternative).
- CLAUDE.md: *"Invoice numbers: INV-00001 sequence; also JOB-, PRE-, GRN-, RCP-, SPY-, RET-."* — RET- confirmed as the prefix for returns, shared across both parties.

### Inferences
- Permission policy for this new endpoint: `preHandler: app.requireAuth`, with an **in-handler branch**:
  - owner → always allowed
  - shopkeeper → allowed only if `createdAt(sale) >= now - 2 days`; otherwise require `ownerAuthPassword` (same verify-with-argon2 flow as void, and same `logActivity({action:"owner_auth_failed"})` on failure).

### Gaps
- Does a customer-return require the `stock` permission? Supplier-return requires `["stock","cost"]`. For customer returns, we don't touch cost, and shopkeepers are the ones ringing up POS, so **recommend `requireAuth` with the age/owner-auth gate in the handler** rather than `requireAllPermissions`. (Open question for the owner; defaulting as above matches the user's instruction *"a shopkeeper is blocked, but the owner can override"* — i.e. shopkeeper is **allowed within 2 days without any password**, which implies the `stock` permission alone is not the discriminator.)

---

## 4. Where to inject the "return credit" into the sale

### Takeaway
Three injection options were considered. **Recommended**: a new optional `returns: { saleId; partId; grade; qty; reason? }[]` array on `SaleInput`. The server creates the return rows **inside the same POST /api/sales transaction**, computes their refund value from the original `sale_items.unitPriceCents` (never trusts the client), and deducts the sum from the running cash due — mirroring exactly how `advanceDeductedCents` already works for pre-orders.

### Cited Findings — the two existing precedents
- **Pre-order advance pattern** (precedent for "credit against the running total"): `SaleInput` already carries `preOrderId?: number` (`shared/src/billing.ts` line 27); the sales route reads `preOrders.advancePaidCents` (routes.ts lines 54–58) and `computeBillTotals` subtracts it via `advanceDeductedCents` (`shared/src/billing.ts` lines 91–92: `const dueCents = totalCents - advanceDeductedCents;`). This is the **cleanest template**.
- **Void pattern** (precedent for "owner-auth-password + stock-back + activity log" in a single transaction): `POST /api/sales/:id/void` (`server/src/sales/routes.ts` lines 229–273) does `verify(settingsRow.ownerAuthPasswordHash, …)`, loops items, increments `partGrades.qty`, inserts `stockMovements` rows with `reason:"void"`, updates `sales.status`. Reuse the verify+log pattern.

### Compared options

| Option | Shape | Pros | Cons |
|---|---|---|---|
| **A: embed in SaleInput** (RECOMMENDED) | `SaleInput.returns?: { saleId; partId; grade; qty; reason?; }[]` + `ownerAuthPassword?` reused | one atomic transaction (return rows + stock-back + sale + stock-out all commit together or none), one invoice/receipt — matches the user's "same bill" rule, mirrors the advance-deduction pattern | SaleInput grows; needs a tiny tweak to `computeBillTotals` to accept `returnCreditCents` similar to `advanceDeductedCents` |
| B: separate pre-sale POST | `POST /api/returns` → returns `creditCents`; POS then calls `POST /api/sales` with `creditAppliedCents` | small routes | two transactions can get wedged (stock back in but sale fails); hard to represent on one receipt; forces client-side plumbing |
| C: new column `salesreturnCreditCents` + separate inner call | hybrid | nothing above A | still two transactions unless we open a shared tx — more complex than A |

### Inferences — recommended server shape
- `SaleInput` additions in `shared/src/billing.ts`:
  ```
  SaleReturnLineInput = z.object({ saleId: number; partId: number; grade: GradeKey; qty: positive int; reason?: string.default("") })
  SaleInput.returns = z.array(SaleReturnLineInput).default([])
  SaleInput.ownerAuthPassword?: string.optional()   // already present
  SaleInput.cashRefundCents?: number.int().nonnegative().optional()  // optional sanity-check echo of what the UI showed
  ```
- `computeBillTotals` gains an optional `returnCreditCents` input (parallel to `advanceDeductedCents`); formula becomes `dueCents = totalCents - advanceDeductedCents - returnCreditCents` (never negative — if negative, that's cash to refund). The function already treats `advanceDeductedCents` with `Math.min(…, totalCents)` — for returns we **do not clamp**, instead we return a new `refundCents = max(0, returnCredit − total − advance)` so the UI shows "Change to give" / "Cash to refund".
- Server-authoritative pricing: for each return line, look up `saleItems.where(saleId=…, partId=…, grade=…)` and use its `unitPriceCents * qty`. Never accept a client-sent refund amount. Reject if `qty > (saleItem.qty - alreadyReturnedQty)`; reject if `sales.status === "voided"`.
- Age check: `now - new Date(sale.createdAt) > 2 days` → requires `ownerAuthPassword` and `verify()` it; on failure, `logActivity({action:"owner_auth_failed", context:"customer_return"})` and 401.
- **Pure-refund-only case**: if `SaleInput.lines.length === 0 && SaleInput.services.length === 0 && SaleInput.returns.length > 0`, the current `.refine((v) => v.lines.length > 0 || v.services.length > 0, …)` will reject. Change the refine to accept `returns.length > 0` as well.

### Gaps
- Should a pure refund still create a `sales` row (with totalCents=0, negative subtotal via returns)? Simpler alternative: a pure refund **does not create a `sales` row**, only inserts the `returns` rows and a cash payout. Trade-offs: a receipt-less flow loses invoice numbering for the refund event; but each `returns` row already has `RET-xxxxx` — that's its own receipt. **Recommendation**: keep it simple — pure refund creates no sales row; the client calls a **separate** `POST /api/returns` route that handles only the standalone case. Mixed cases (return + new items) go through the extended `POST /api/sales`. The UI should treat both from one sheet, picking the right endpoint based on whether `cart.lines + cart.services` is empty.

---

## 5. Accounting model: cash vs credit, void, voided-sale returns

### Takeaway
Default refund = cash (always, regardless of how the original was paid), because the user's policy says "pay out the difference in cash" / "pure cash refund." If the original was a credit sale, the shopkeeper has the option on the sheet to **apply the return value to the customer's outstanding credit balance** instead of taking cash out of the drawer. This is implemented by issuing a `payments` row of type `customer_credit` for the customer, in the same transaction.

### Cited Findings
- `customerBalanceCents` (`server/src/customers/balance.ts` lines 7–18): `balance = Σ(credit_sale.totalCents − amountPaidCents) − Σ(customer_credit payments)`. A return booked as a "payment" against the customer reduces the balance mechanically — correct.
- `payments` table enum values accept `type: "customer_credit"` (see routes.ts line 143 and the schema export in `server/src/db/schema/index.js`). Numbering uses `nextSeq("RCP", payments, eq(payments.type, "customer_credit"))`.
- The sale `status` enum is `"completed" | "voided"` (sales.ts line 25). The void endpoint already restores stock, so **returning items from a voided sale is nonsensical and must be blocked** at the server: reject with 400 "That bill was voided — no items to return".
- No existing field tracks "returned qty per sale-item line." We compute it on-the-fly from `returns.where(saleId=X, partId=P, grade=G).sum(qty)` and compare to `saleItems.qty`.

### Inferences — refund routing options
- **Cash refund (default)**: insert cash-out stock-independent step; implicit via `changeCents` already present on `sales`? No — `changeCents` is sign-positive and only exists when the row has a sale. For the mixed case, we can represent the net cash-out as a **negative** `changeCents` or widen it to a signed int. Cleanest: add a new `refundOutCents` column on `sales` (default 0) **OR** reuse `changeCents` as signed (SQLite's INTEGER is signed, no migration needed; today it is non-negative only by convention). **Recommendation**: reuse `changeCents` as a signed int ("positive = give change back; negative = take cash out for refund"), and update the receipt printer to render it accordingly. Avoids a schema change.
- **Credit-balance refund** (only shown when the sale being returned was a credit sale OR the current cart's customer has an outstanding balance): insert a `payments` row `{type:"customer_credit", partyId:customerId, amountCents: refundToCreditCents, method:"return_credit", note:"Credit against return RET-xxxxx"}` in the same tx.
  - The `payments.method` column currently accepts specific enums; check and extend to include `"return_credit"` or reuse `"cash"` with the note making the origin clear. Simplest: add `"return_credit"` to the method enum (one-line migration).

### Gaps
- Does the user want **partial discount/round-off reversal**? Policy as stated is "refund value" and I interpreted this as `unitPriceCents * qty` (pre-discount). If the user later wants exact-paid-pro-rata, we need: `linePaid = unitPriceCents * qty * (totalCents / subtotalCents)` from the original sale. Flag for owner confirmation; not blocking.

---

## 6. Partial-quantity returns and double-return guards

### Takeaway
The `returns.qty` is already an int, so partial returns work. We enforce two constraints at request-validation time: (i) `qty ≤ (sale_item.qty − already_returned_qty_for_same_part_grade_on_same_saleId)`, (ii) `sales.status === "completed"` (not voided).

### Cited Findings
- `sale_items.qty` is `integer NOT NULL` (`server/src/db/schema/sales.ts` line 42).
- `returns.qty` is `integer NOT NULL` (`returns.ts` line 19).
- Void sets `sales.status = "voided"` (routes.ts line 261).
- The cart dedupes by `(partId, grade)` (`web/src/lib/cart.ts` line 15), so a sale has at most one row per `(partId, grade)` tuple — the three-tuple `(saleId, partId, grade)` is effectively unique in `sale_items`.

### Inferences — the three guard checks the server must run per return line
1. `sale = sales.where(id = line.saleId).get()`; if not found → 400.
2. `sale.status === "voided"` → 400 "That bill was voided — no items to return."
3. `saleItem = sale_items.where(saleId=…, partId=line.partId, grade=line.grade).get()`; if not found → 400 "That item isn't on that bill."
4. `alreadyReturned = returns.where(saleId=…, partId=…, grade=…).sum(qty)` (filter `partyType = "customer"` to be safe).
5. If `line.qty > saleItem.qty − alreadyReturned` → 400 "Only N of that item is still returnable (sold M, returned K)."

### Gaps
- None. The schema has no `UNIQUE(saleId, partId, grade)` on `sale_items`, but the cart-side merge means duplicates aren't produced by this app. If seed data or a future migration ever introduces split lines, the guard still works — it sums all matching rows.

---

## 7. Interaction concerns: logs, movements, sale flags

### Takeaway
- Activity-log action: use the existing `"return"` enum (no migration).
- Stock-movements reason: use the existing `"return"` enum but with `qtyDelta: +qty` (positive, opposite sign to supplier-return).
- Sales table: **no new flag needed**; "has this sale been returned against?" is answered by `SELECT 1 FROM returns WHERE sale_id = ? AND party_type='customer' LIMIT 1`. For performance later, add an index `returns_sale_id_idx` in a follow-up migration if the sales-history UI needs it.

### Cited Findings
- `activityLog.action` enum in `activity-log.ts` line 15: `… "grn", "return", "supplier_created", …` — present.
- `stockMovements.reason` enum in `stock-movements.ts` line 10: `"sale" | "void" | "grn" | "return" | "count" | "adjustment"` — present.
- The supplier-return path uses `refType: "return", refId: row.id` (routes.ts line 225). We reuse the same `(refType, refId)` convention.
- Current `logActivity` call site for supplier returns (`server/src/suppliers/routes.ts` line 230): `logActivity({ userId, action: "return", entityType: "supplier", entityId: id, details: { returnNo, amountCents }})`. For customers: `entityType: "customer", entityId: customerId, details: { returnNo, saleId, invoiceNo, amountCents }`.

### Inferences
- No new enum values. No new columns. No migration required for the "accept customer returns" MVP. One migration is **optional** and only for method enum (see §5).

### Gaps
- Receipt reprint for the return: not scoped here; the receipt generator (`web/print`) will need a mode that prints a return receipt from a `returns.returnNo`. Flagged but out of scope.

---

## 8. UX: the POS "Exchange / return" button and sheet

### Takeaway
- Button lives on the right-sidebar **Bill** card, next to the existing "Billed by" footer line, under the item list. Label: **"Exchange or return items"**, variant `outline`, icon `LuRotateCcw`. Also mirrored into the mobile overflow (nearby to "Add service charge").
- The sheet is a **two-step** `Sheet` reusing the existing `Sheet` primitive (`web/src/components/ui/sheet.tsx`):
  - **Step 1 — Find bill**: three tabs or a free-text search (one `Input` with placeholder "Invoice no, customer name, or phone"). Server call: `GET /api/sales?q=…` (already exists, routes.ts lines 185–210) returns up to 300 matching sales with customer+billedByName. Render a scrollable list of result rows with `INV-xxxxx`, customer name/phone, date (Asia/Colombo), total, status. If `now - createdAt > 2 days`, the row is tinted **red** (`bg-destructive-soft text-destructive`) with "> 2 days old — needs owner approval" sub-label; if voided, show "VOIDED" badge and disable the row.
  - **Step 2 — Pick items & qty**: once a bill is picked, hit `GET /api/sales/:id` (already exists) to load items; render each sale_item as a row with `[Checkbox] partName (grade badge) × up to (sold-alreadyReturned)` and a qty stepper (same `LuMinus`/`LuPlus` pattern as the cart). Show per-row and sum "Refund value: Rs. X,XXX.XX". A `Reason (optional)` single `Input` sits at the bottom.
    - If the bill was >2 days old, show the owner-auth password `Input type="password"` with the error-aware styling used by the credit sheet.
    - Primary button: **"Add to current bill"** (variant `default`). Secondary: "Cancel".
- Back in POS, applied returns show as **negative-valued lines** at the top of the cart list, each labeled `RET source: INV-xxxxx — <part name>` with a red minus sign and `−Rs. X,XXX.XX`. They are not stored in `useCart` directly (to keep the cart simple); instead, a new sibling piece of state `useReturns()` tracks the queued-but-not-yet-posted return refs and the sheet-driven totals.
- The totals block gets one new row between "Discount" and "Round off":
  - `Return credit  − Rs. X,XXX.XX`
- The "Total" row relabels to "To collect" when `due > 0`, and to **"Cash to refund"** (red) when `due < 0`. The payment selector and "Cash received" fields are hidden when due is negative/zero; a single read-only "Cash to refund" summary replaces them.

### Match the Workshop theme & conventions
- Reuse `Sheet` → bottom-sheet on phone, dialog on desktop.
- Colors: red `#B23E2C` only on the >2-day row tint and the "Cash to refund" line (CLAUDE.md "red for low stock / owed only" — refund-out counts as owed-out).
- Font: `font-cond tabular` on the refund money amount, same as other totals.
- Icons: `LuRotateCcw` (return/exchange), `LuReceipt` (bill result rows), `LuShieldAlert` (older-than-2-days badge).

### Cited references in the codebase we match
- `ServiceChargeSheet` (`web/src/pages/pos/service-charge-sheet.tsx`) — the structural template: a `Sheet` with a search `Input`, a `max-h-[280px] overflow-y-auto` result list, and a secondary "custom entry" footer.
- The cart stacked-row style — `web/src/pages/pos.tsx` lines 241–258 for the line-row layout and the `font-cond tabular` money column.
- The credit-sale `Sheet` — `web/src/pages/pos.tsx` lines 345–355 for the owner-auth password `Input type="password"` + error pattern.
- `useCustomerSearch` (`web/src/lib/customers.ts` lines 20–32) — can be reused for the customer-name/phone search; however, since **the server already filters `GET /api/sales?q=` by invoice/customer/vehicle** (routes.ts line 206), it's simpler and more useful to call that endpoint directly with the raw query — no need to resolve a customer first.

---

## 9. Executable file-by-file plan

### Shared package

**`shared/src/billing.ts` — EDIT**
- Add schema:
  ```
  export const SaleReturnLineInput = z.object({
    saleId: z.number().int().positive(),
    partId: z.number().int().positive(),
    grade: GradeKey,
    qty: z.number().int().positive(),
    reason: z.string().default(""),
  });
  export type SaleReturnLineInput = z.infer<typeof SaleReturnLineInput>;
  ```
- Extend `SaleInput`: add `returns: z.array(SaleReturnLineInput).default([])` and relax the `.refine(...)` to allow `v.returns.length > 0` alone to satisfy "has at least one item".
- Extend `computeBillTotals` signature `options` to include `returnCreditCents?: number`. In the function body, compute `const returnCreditCents = Math.max(0, options.returnCreditCents ?? 0);` and new output: `dueCents = Math.max(0, totalCents - advanceDeductedCents - returnCreditCents)` and `refundOutCents = Math.max(0, (advanceDeductedCents + returnCreditCents) - totalCents)`. Return both.
- Keep the function pure; the live-preview POS screen and the server use the same math.

**`shared/src/billing.test.ts` — NEW (Vitest)**
- `computeBillTotals applies return credit before due`
- `return credit greater than total surfaces as refundOutCents (cash to refund)`
- `return credit + advance + total 0 edge case`
- Zod: `SaleInput accepts returns array alone (no lines/services)`

### Server

**`server/src/sales/routes.ts` — EDIT `POST /api/sales`**
- Before the main transaction, if `input.returns.length > 0`:
  - Build a map `returnPricing: Map<string, { saleItem; priceCents }>` keyed by `${saleId}:${partId}:${grade}`:
    - fetch each referenced `sales` row; reject if not found or `status === "voided"`
    - fetch each matching `sale_items` row; reject if not found
    - compute `alreadyReturned` from `returns.where(saleId=…, partyType="customer", partId=…, grade=…).sum(qty)` and reject if `line.qty > saleItem.qty - alreadyReturned`
    - compute `line.refundCents = saleItem.unitPriceCents * line.qty`
  - Compute `totalReturnCreditCents = Σ refundCents`.
- **Age gate** — for any referenced sale older than `nowMs - 2*24*3600*1000`:
  - `isOwner` → ok
  - else require `input.ownerAuthPassword`, `verify(settingsRow.ownerAuthPasswordHash, …)`
    - on failure: `logActivity({action:"owner_auth_failed", details:{context:"customer_return", saleId}})`, `reply.code(401).send({error:"Wrong authorization password"})`
- Call `computeBillTotals(…, { … returnCreditCents: totalReturnCreditCents })`.
- Inside the existing `db.transaction((tx) => { … })`:
  - For each return line: `nextSeq("RET", returns, undefined, tx)` → insert a `returns` row with `partyType:"customer", saleId:line.saleId, customerId:origSale.customerId, partId, grade, qty, amountCents: refundCents, reason`.
  - Update `partGrades.qty += qty` (increment).
  - Insert `stockMovements` row with `qtyDelta: +qty, reason:"return", refType:"return", refId: returnRow.id, note: "Customer return RET-… (from INV-…)"`.
  - If `refundOutCents > 0`:
    - If the current cart has a known customer that already carries credit AND the UI opted "apply to credit balance" (new optional flag `applyRefundToCredit?: boolean` on SaleInput): insert a `payments` row `{paymentNo: nextSeq("RCP", payments, eq(payments.type,"customer_credit")), type:"customer_credit", partyId: customerId, amountCents: refundOutCents, method:"return_credit", note: `From returns RET-…`}`.
    - Else: `changeCents = -refundOutCents` (signed) on the `sales` row (if a sales row is being created in this transaction). If pure refund (no cart lines/services), skip; see pure-refund path below.
- **Pure refund path** (`lines.length === 0 && services.length === 0 && returns.length > 0`): the handler still processes returns inside its own transaction, does NOT insert a `sales` row, inserts a cash-out activity log entry `logActivity({action:"return", entityType:"customer", entityId:customerId, details:{returnNos, totalRefundCents, cashOutCents, creditAppliedCents}})`, and responds `{ returns, refundOutCents, creditAppliedCents }`.
- Activity log on normal flow: after sale commit, additionally `logActivity({action:"return", entityType:"sale", entityId:sale.id, details:{saleId, returnNos:[…], refundCents:totalReturnCreditCents}})`.
- Response shape additions: `{ ..., returns: [{returnNo, refundCents}], refundOutCents, creditAppliedCents }`.

**`server/src/sales/routes.ts` — tests to add in `routes.test.ts`**
- `includes returns in SaleInput: stock increments, return rows inserted, totals net return credit`
- `return + new items in one bill: due = total − returnCredit; negative due becomes refundOutCents`
- `pure refund (no new items) creates no sales row, inserts returns & stock movements`
- `shopkeeper is blocked when original bill is >2 days old without owner password`
- `shopkeeper succeeds with owner password; failed password → 401 + owner_auth_failed log`
- `returning more than sold-minus-already-returned → 400`
- `returning from a voided sale → 400`
- `customer_credit payment created when applyRefundToCredit is set`

**`shared/src/billing.ts` — SaleInput refine** (already noted).

### Web

**`web/src/lib/returns-cart.ts` — NEW**
- `type QueuedReturn = { saleId: number; invoiceNo: string; partId: number; partName: string; grade: GradeKey; qty: number; refundCents: number; reason: string }`
- `function useReturns()` → returns `{ returns, add, remove, clear, totalRefundCents }` (parallel to `useCart`).

**`web/src/pages/pos/return-sheet.tsx` — NEW**
- Props: `{ open: boolean; onClose: () => void; onApply: (returns: QueuedReturn[], ownerAuthPassword?: string) => void }`.
- Two-stage state machine `"find" | "pick"`.
- Stage "find": `Input` wired to `GET /api/sales?q=` (debounced like `useCustomerSearch` line 25); list rendered with `LuReceipt` icon, voided bills disabled, >2-day bills tinted red (`bg-destructive-soft`) with a `LuShieldAlert` chip "Needs owner approval".
- Stage "pick": `GET /api/sales/:id` on bill select; render each sale_item with `[Checkbox]`, qty stepper (reusing the three-button pattern from `pos.tsx` lines 250–254), per-row refund `font-cond tabular`. Already-returned items disabled with a "already returned" chip (data from a new `GET /api/sales/:id/returnable` or extend the existing endpoint to include `alreadyReturnedQty` per item). Reason `Input`. If the bill is >2 days old, owner-auth `Input type="password"` + error field (same pattern as `pos.tsx` lines 349–352).
- Footer: `<Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={apply}>Add to bill</Button>`.

**`web/src/pages/pos.tsx` — EDIT**
- Add `const returnsCart = useReturns();`
- Add button in Bill card header or just below the item list: `<Button variant="outline" onClick={() => setRetSheet(true)}><LuRotateCcw />Exchange or return items</Button>`.
- Render queued returns at the top of the cart `<ul>` with a `−Rs. X,XXX.XX` right-aligned value, red color, "RET source: INV-xxxxx" subtext.
- Pass `returnCreditCents: returnsCart.totalRefundCents` into the local `computeBillTotals` call so the live preview matches the server.
- When `totals.refundOutCents > 0`, change the "Total" row label to "Cash to refund" and hide the payment selector + cash received inputs; show just a read-only amount with a red color.
- In `buildPayload()`: add `returns: returnsCart.returns.map(r => ({ saleId: r.saleId, partId: r.partId, grade: r.grade, qty: r.qty, reason: r.reason }))` and `ownerAuthPassword: ownerPasswordFromSheet` (lifted from the sheet via `onApply`).
- `resetAll` should also `returnsCart.clear()`.
- Mount `<ReturnSheet open={retSheet} onClose={() => setRetSheet(false)} onApply={(items, pw) => { items.forEach(returnsCart.add); setOwnerPwd(pw ?? ""); setRetSheet(false); }} />`.

**`web/src/components/grade-button.tsx`** — no change.

### Server (optional cosmetic)

**`server/src/sales/routes.ts` — GET /api/sales/:id — EDIT**
- Augment the response: include `alreadyReturnedQty` per saleItem (SQL sum). Lets the sheet show "returnable: N" without a second round-trip.

### Migration (optional)

**`server/src/db/schema/payments.ts` — EDIT only if method enum needs `"return_credit"`**
- If current `payments.method` enum lacks `"return_credit"`, add it and generate a new drizzle migration (`npm run db:migrate`). If the enum is open text (likely — many `method` columns in this repo are open text), no migration needed. Confirm by reading the payments schema.

### Vitest coverage summary (new tests)

- `shared/src/billing.test.ts`: 4 tests on `computeBillTotals` with return credit.
- `server/src/sales/routes.test.ts`: 7 tests listed under the POST /api/sales section above.

### Commit plan (one step per CLAUDE.md "commit after each working step")

1. shared: add `SaleReturnLineInput`, extend `SaleInput`, extend `computeBillTotals`, write Vitest.
2. server: extend `POST /api/sales` to accept `returns`; implement validation, age gate, transaction logic, activity log, response. Extend `GET /api/sales/:id` with `alreadyReturnedQty`. Vitest.
3. web: add `useReturns` + `ReturnSheet`, wire into `PosPage`, add live-preview return credit, "Cash to refund" relabel. Smoke-test end-to-end against the server.
4. web polish: red tint for >2-day rows, voided-row disable, `LuRotateCcw` icon, Workshop-theme pass.

---

## Appendix — key file paths referenced

- `D:\Projects\spareparts-erp\CLAUDE.md`
- `D:\Projects\spareparts-erp\docs\blueprint\SpareParts-ERP-v3.html` (lines 333, 369, 888, 907, 928)
- `D:\Projects\spareparts-erp\server\src\db\schema\returns.ts`
- `D:\Projects\spareparts-erp\server\src\db\schema\sales.ts`
- `D:\Projects\spareparts-erp\server\src\db\schema\stock-movements.ts`
- `D:\Projects\spareparts-erp\server\src\db\schema\activity-log.ts`
- `D:\Projects\spareparts-erp\server\src\sales\routes.ts`
- `D:\Projects\spareparts-erp\server\src\suppliers\routes.ts` (POST /:id/returns template, lines 197–232)
- `D:\Projects\spareparts-erp\server\src\customers\balance.ts`
- `D:\Projects\spareparts-erp\server\src\sequence.ts`
- `D:\Projects\spareparts-erp\server\src\activity-log.ts`
- `D:\Projects\spareparts-erp\shared\src\billing.ts`
- `D:\Projects\spareparts-erp\shared\src\suppliers.ts` (SupplierReturnInput template, lines 49–56)
- `D:\Projects\spareparts-erp\web\src\pages\pos.tsx`
- `D:\Projects\spareparts-erp\web\src\lib\cart.ts`
- `D:\Projects\spareparts-erp\web\src\lib\customers.ts`
- `D:\Projects\spareparts-erp\web\src\lib\pending-bill.ts`
- `D:\Projects\spareparts-erp\web\src\pages\pos\service-charge-sheet.tsx`
- `D:\Projects\spareparts-erp\web\src\components\ui\sheet.tsx`
- `D:\Projects\spareparts-erp\server\drizzle\0000_minor_viper.sql` (lines 316–339, returns table)
