import { hash } from "argon2";
import { db } from "./client.js";
import { users, mechanics, settings, parts, partGrades, servicePriceList } from "./schema/index.js";

const now = new Date().toISOString();
const r10 = (v: number) => Math.round(v / 10) * 10;

type GradeKey = "GEN" | "AA" | "A";
type Row = [string, string, string, string, string, "Motorcycle" | "Three-wheeler" | "Both", number, string];

const rows: Row[] = [
  ["BJ-BS-01", "Brake shoe rear", "Bajaj", "CT100, Discover 125", "Brakes", "Motorcycle", 1200, "A1"],
  ["BJ-CS-02", "Chain sprocket kit", "Bajaj", "CT100, Discover 125", "Transmission", "Motorcycle", 6500, "B2"],
  ["BJ-EG-03", "Engine guard", "Bajaj", "Pulsar 150", "Body", "Motorcycle", 4800, "C3"],
  ["BJ-CP-04", "Clutch plate set", "Bajaj", "Pulsar 150, Discover 125", "Engine", "Motorcycle", 3200, "D4"],
  ["BJ-PR-05", "Piston ring set", "Bajaj", "RE 205", "Engine", "Three-wheeler", 3400, "E1"],
  ["BJ-HG-06", "Head gasket", "Bajaj", "RE 205", "Engine head", "Three-wheeler", 950, "F2"],
  ["BJ-BP-07", "Brake pad front", "Bajaj", "Pulsar 150", "Brakes", "Motorcycle", 1800, "A3"],
  ["BJ-SP-08", "Spark plug", "Bajaj", "CT100, Discover 125, Pulsar 150", "Electrical", "Motorcycle", 650, "B4"],
  ["BJ-AF-09", "Air filter", "Bajaj", "RE 205", "Filters", "Three-wheeler", 1100, "C1"],
  ["HN-BS-01", "Brake shoe", "Honda", "Dio", "Brakes", "Motorcycle", 1400, "F4"],
  ["HN-VB-02", "V-belt", "Honda", "Dio", "Transmission", "Motorcycle", 3800, "A1"],
  ["HN-CP-03", "Clutch plate set", "Honda", "CD 125, Hornet", "Engine", "Motorcycle", 3600, "B2"],
  ["HN-VS-06", "Valve seal set", "Honda", "CD 125, Hornet", "Engine head", "Motorcycle", 1200, "E2"],
  ["TV-BP-01", "Brake pad front", "TVS", "Apache 160", "Brakes", "Motorcycle", 1900, "F2"],
  ["TV-CK-02", "Chain kit", "TVS", "Apache 160, Metro", "Transmission", "Motorcycle", 6200, "A3"],
  ["TV-SA-03", "Shock absorber rear", "TVS", "King", "Suspension", "Three-wheeler", 7800, "B4"],
  ["YM-AF-01", "Air filter", "Yamaha", "FZ", "Filters", "Motorcycle", 1300, "C1"],
  ["YM-BP-02", "Brake pad rear", "Yamaha", "FZ, Ray ZR", "Brakes", "Motorcycle", 1600, "A1"],
  ["YM-EG-04", "Engine guard", "Yamaha", "FZ", "Body", "Motorcycle", 5200, "E4"],
  ["HR-BS-01", "Brake shoe", "Hero", "Splendor, Pleasure", "Brakes", "Motorcycle", 1100, "D4"],
  ["HR-HG-03", "Head gasket", "Hero", "Splendor", "Engine head", "Motorcycle", 850, "F2"],
];
const stockSeed = [15, 6, 3, 9, 4, 22, 24, 48, 7, 6, 2, 11, 14, 11, 5, 2, 9, 9, 1, 18, 12];

async function main() {
  const ownerAuthHash = await hash("99999");

  db.insert(settings).values({
    maxDiscountPct: 5,
    autoDiscountOverCents: 500000,
    autoDiscountPct: 5,
    roundToCents: 1000,
    roundDirection: "down",
    taxPct: 0,
    ownerAuthPasswordHash: ownerAuthHash,
    shopName: "Spare Parts Shop",
  }).run();

  const [gayan] = db.insert(users).values({
    name: "Gayan", username: "admin", passwordHash: await hash("12345"),
    role: "owner", canStock: true, canCost: true, createdAt: now,
  }).returning().all();

  const staffSeed = [
    { name: "Nimal", username: "nimal", password: "1111", canStock: true, canCost: false, salaryCents: 4500000, commissionPct: 2 },
    { name: "Kasun", username: "kasun", password: "1111", canStock: true, canCost: false, salaryCents: 4500000, commissionPct: 2 },
  ];
  const staffRows: (typeof gayan)[] = [];
  for (const s of staffSeed) {
    const [row] = db.insert(users).values({
      name: s.name, username: s.username, passwordHash: await hash(s.password),
      role: "shopkeeper", canStock: s.canStock, canCost: s.canCost,
      salaryCents: s.salaryCents, commissionPct: s.commissionPct, createdAt: now,
    }).returning().all();
    staffRows.push(row);
  }

  db.insert(mechanics).values([
    { name: "Ruwan", salaryCents: 8000000, commissionPct: 10, createdAt: now },
    { name: "Saman", salaryCents: 8000000, commissionPct: 10, createdAt: now },
  ]).run();

  const defaultServices: [string, number][] = [
    ["Full service", 2500], ["Oil change (labour)", 500], ["Brake adjustment", 400],
    ["Tune-up", 1500], ["Chain adjust & lube", 300], ["Engine repair (labour)", 6000],
    ["Wiring check", 800], ["Puncture repair", 250],
  ];
  db.insert(servicePriceList).values(defaultServices.map(([name, price]) => ({ name, priceCents: price * 100, active: true }))).run();

  const kasunRow = staffRows.find((u) => u.username === "kasun")!;

  rows.forEach(([partNo, name, manufacturer, models, category, vehicle, p, rack], i) => {
    const q = stockSeed[i];
    const updatedBy = i % 3 ? kasunRow.id : gayan.id;

    const [part] = db.insert(parts).values({
      partNo, name, manufacturer, category,
      vehicleType: vehicle,
      rack,
      models: models.split(",").map((m) => m.trim()),
      createdAt: now, updatedAt: now, updatedBy,
    }).returning().all();

    const grades: { grade: GradeKey; cost: number; price: number | null; qty: number }[] = [
      { grade: "GEN", price: p, cost: r10(p * 0.72), qty: q },
      { grade: "AA", price: i % 5 === 3 ? null : r10(p * 0.6), cost: r10(p * 0.42), qty: (q * 3) % 26 },
      { grade: "A", price: i % 4 === 1 ? null : r10(p * 0.42), cost: r10(p * 0.27), qty: (q * 7) % 21 },
    ];
    for (const g of grades) {
      db.insert(partGrades).values({
        partId: part.id, grade: g.grade,
        costCents: g.cost * 100,
        priceCents: g.price === null ? null : g.price * 100,
        qty: g.price === null ? 0 : g.qty,
        reorderLevel: 5,
      }).run();
    }
  });

  console.log("Seed complete.");
}

main();
