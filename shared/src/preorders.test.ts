import { describe, expect, it } from "vitest";
import { daysUntil, isPreOrderUrgent } from "./preorders.js";

const today = new Date(2026, 10, 1); // Nov 1, 2026

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    expect(daysUntil("2026-11-01", today)).toBe(0);
  });
  it("returns a positive number for a future date", () => {
    expect(daysUntil("2026-11-06", today)).toBe(5);
  });
  it("returns a negative number for a past date", () => {
    expect(daysUntil("2026-10-29", today)).toBe(-3);
  });
});

describe("isPreOrderUrgent", () => {
  it("is urgent when the promised date already passed", () => {
    expect(isPreOrderUrgent("2026-10-30", today)).toBe(true);
  });
  it("is urgent when due today", () => {
    expect(isPreOrderUrgent("2026-11-01", today)).toBe(true);
  });
  it("is urgent when due in exactly 2 days", () => {
    expect(isPreOrderUrgent("2026-11-03", today)).toBe(true);
  });
  it("is not urgent when due in 3 or more days", () => {
    expect(isPreOrderUrgent("2026-11-04", today)).toBe(false);
  });
});
