import type { Part } from "@/lib/parts";

export function searchWords(q: string) {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Every word must appear in our number, name, make, category, models, rack, vehicle or any supplier's part number. */
export function partMatches(p: Part, words: string[]) {
  if (!words.length) return true;
  const hay = [
    p.partNo, p.name, p.manufacturer, p.category, p.vehicleType, p.rack, ...p.models,
    ...p.supplierNumbers.map((s) => s.supplierPartNo),
  ].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}
