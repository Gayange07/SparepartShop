/**
 * Inventory seed: loads the Sri Lankan opening-stock catalogue (337 parts).
 * Run with: npm run db:seed:inventory
 * Reset first: npm run db:seed:inventory:reset (deletes all parts then inserts)
 */
import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { parts, partGrades, stockMovements } from "../schema/index.js";
import { logActivity } from "../../activity-log.js";
import { createReadStream } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

type CatalogueGrade = { priceRs: number; costRs: number; qty: number; reorder: number };
type CataloguePart = {
  partNo: string;
  name: string;
  category: string;
  manufacturer: string;
  models: string[];
  vehicle: "Motorcycle" | "Three-wheeler" | "Both";
  vehicleClass: string;
  unit: string;
  sells: string;
  brandItem: boolean;
  grades: { GEN?: CatalogueGrade; AA?: CatalogueGrade; A?: CatalogueGrade };
  priceSource?: string;
  priceSourceUrl?: string;
  priceEstimated: boolean;
  rack: string;
};

type MetaJson = { parts: number; gradeRows: number; totalQty: number; totalCostRs: number; estimatedParts: number };

function loadCatalogue(): CataloguePart[] {
  const raw = readFileSync(join(__dirname, "catalogue", "parts.json"), "utf8");
  return JSON.parse(raw) as CataloguePart[];
}

function loadMeta(): MetaJson {
  const raw = readFileSync(join(__dirname, "catalogue", "meta.json"), "utf8");
  return JSON.parse(raw) as MetaJson;
}

const args = process.argv.slice(2);
const isReset = args.includes("--reset");
const isYes = args.includes("--yes");

const catalogue = loadCatalogue();
const meta = loadMeta();

// Validate every part
for (const p of catalogue) {
  if (!p.partNo || !p.name || !p.category || !p.manufacturer) {
    console.error(`Invalid part: ${p.partNo} — missing required fields`);
    process.exit(1);
  }
  if (!Array.isArray(p.models)) {
    console.error(`Invalid part: ${p.partNo} — models must be an array`);
    process.exit(1);
  }
}

if (isReset && !isYes) {
  console.log("Run with --reset --yes to wipe and reload. This deletes all parts.");
  process.exit(0);
}

const now = new Date().toISOString();
let partsAdded = 0, partsSkipped = 0, gradeRows = 0, totalQty = 0, totalCostRs = 0;

db.transaction((tx) => {
  if (isReset) {
    tx.delete(stockMovements).run();
    tx.delete(partGrades).run();
    tx.delete(parts).run();
    console.log("Cleared: parts, part_grades, stock_movements");
  }

  for (const p of catalogue) {
    const existing = tx.select({ id: parts.id }).from(parts).where(eq(parts.partNo, p.partNo)).get();
    if (existing && !isReset) {
      partsSkipped++;
      continue;
    }

    const [inserted] = tx.insert(parts).values({
      partNo: p.partNo,
      name: p.name,
      manufacturer: p.manufacturer,
      category: p.category,
      vehicleType: p.vehicle,
      rack: p.rack ?? "",
      models: p.models,
      unit: p.unit,
      sells: p.sells,
      brandItem: p.brandItem,
      vehicleClass: p.vehicleClass,
      priceEstimated: p.priceEstimated,
      priceSource: p.priceSource ?? null,
      priceSourceUrl: p.priceSourceUrl ?? null,
      createdAt: now,
      updatedAt: now,
      updatedBy: null,
    }).returning().all();

    partsAdded++;

    const gradesToInsert = p.brandItem
      ? [["GEN", p.grades.GEN] as const]
      : (["GEN", "AA", "A"] as const).map((k) => [k, p.grades[k]] as const).filter(([, g]) => g != null);

    for (const [gradeKey, g] of gradesToInsert) {
      if (!g) continue;
      tx.insert(partGrades).values({
        partId: inserted.id,
        grade: gradeKey,
        costCents: Math.round(g.costRs * 100),
        priceCents: Math.round(g.priceRs * 100),
        qty: g.qty,
        reorderLevel: g.reorder,
      }).run();

      gradeRows++;
      totalQty += g.qty;
      totalCostRs += g.costRs * g.qty;

      if (g.qty > 0) {
        tx.insert(stockMovements).values({
          partId: inserted.id,
          grade: gradeKey,
          qtyDelta: g.qty,
          reason: "adjustment",
          note: "Opening stock (catalogue seed)",
          userId: null,
          createdAt: now,
        }).run();
      }
    }
  }
});

logActivity({
  userId: null,
  action: "stock_change",
  details: {
    event: "inventory_seed",
    partsAdded, partsSkipped, gradeRows, totalQty,
    totalCostRs: Math.round(totalCostRs),
  },
});

console.log("\n=== Inventory seed complete ===");
console.log(`Parts added:   ${partsAdded}  (expected ${meta.parts})`);
console.log(`Parts skipped: ${partsSkipped}`);
console.log(`Grade rows:    ${gradeRows}  (expected ${meta.gradeRows})`);
console.log(`Total qty:     ${totalQty}  (expected ${meta.totalQty})`);
console.log(`Total cost:    Rs ${Math.round(totalCostRs).toLocaleString()}  (expected Rs ${meta.totalCostRs.toLocaleString()})`);
console.log(`Est. prices:   ${catalogue.filter((p) => p.priceEstimated).length}  (expected ${meta.estimatedParts})`);

const ok =
  partsAdded === meta.parts &&
  gradeRows === meta.gradeRows &&
  totalQty === meta.totalQty &&
  Math.round(totalCostRs) === meta.totalCostRs;

if (!ok) {
  console.error("\nMISMATCH — do not commit. Check the numbers above.");
  process.exit(1);
} else {
  console.log("\nAll checks pass.");
}
