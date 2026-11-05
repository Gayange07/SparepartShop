import * as React from "react";
import type { GradeKey } from "shared";
import type { Part } from "@/lib/parts";

export type CartLine = { partId: number; grade: GradeKey; qty: number };
export type ServiceLine = { description: string; amountRupees: number; mechanicId?: number };

/** useState that survives leaving the page (tab-scoped), so a half-made bill isn't lost. */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return initial;
      const saved = JSON.parse(raw) as unknown;
      // Anything saved by an older version in a different shape is dropped rather than crashing the page.
      const sameShape = Array.isArray(initial) ? Array.isArray(saved) : typeof saved === typeof initial || initial === undefined || saved === null;
      return sameShape ? (saved as T) : initial;
    } catch { return initial; }
  });
  React.useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useCart(parts: Part[]) {
  const [lines, setLines] = useSessionState<CartLine[]>("pos.lines", []);
  const [services, setServices] = useSessionState<ServiceLine[]>("pos.services", []);

  // A saved line whose part was deleted or whose grade is no longer sold can't be shown or billed — drop it.
  React.useEffect(() => {
    if (!parts.length) return;
    setLines((ls) => {
      const kept = ls.filter((l) => parts.find((p) => p.id === l.partId)?.grades[l.grade]);
      return kept.length === ls.length ? ls : kept;
    });
  }, [parts]);

  const inCart = (partId: number, grade: GradeKey) => lines.find((l) => l.partId === partId && l.grade === grade)?.qty ?? 0;

  const add = (partId: number, grade: GradeKey) => {
    setLines((ls) => ls.some((l) => l.partId === partId && l.grade === grade)
      ? ls.map((l) => (l.partId === partId && l.grade === grade ? { ...l, qty: l.qty + 1 } : l))
      : [...ls, { partId, grade, qty: 1 }]);
  };

  const setQty = (i: number, n: number, onCapped?: (max: number) => void) => setLines((ls) => {
    const l = ls[i];
    if (!l) return ls;
    if (n <= 0) return ls.filter((_, j) => j !== i);
    const part = parts.find((p) => p.id === l.partId);
    const max = part?.grades[l.grade]?.qty ?? 0;
    if (n > max) {
      onCapped?.(max);
      n = max;
      if (n <= 0) return ls.filter((_, j) => j !== i);
    }
    return ls.map((x, j) => (j === i ? { ...x, qty: n } : x));
  });

  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));
  const addService = (s: ServiceLine) => setServices((v) => [...v, s]);
  const removeService = (i: number) => setServices((v) => v.filter((_, j) => j !== i));
  const clear = () => { setLines([]); setServices([]); };

  const lineTotalRupees = lines.reduce((s, l) => {
    const part = parts.find((p) => p.id === l.partId);
    const price = part?.grades[l.grade]?.price ?? 0;
    return s + l.qty * price;
  }, 0);
  const serviceTotalRupees = services.reduce((s, v) => s + v.amountRupees, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0) + services.length;

  return { lines, services, inCart, add, setQty, removeLine, addService, removeService, clear, lineTotalRupees, serviceTotalRupees, itemCount };
}
