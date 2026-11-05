import { describe, expect, it } from "vitest";
import { computeStockDelta } from "./parts.js";

describe("computeStockDelta", () => {
  it("adds qty for a stock-in", () => {
    expect(computeStockDelta(10, { grade: "GEN", action: "in", qty: 5, note: "" })).toEqual({ delta: 5 });
  });

  it("subtracts qty for a stock-out", () => {
    expect(computeStockDelta(10, { grade: "GEN", action: "out", qty: 4, note: "" })).toEqual({ delta: -4 });
  });

  it("rejects a stock-out that would push qty below zero", () => {
    const r = computeStockDelta(3, { grade: "GEN", action: "out", qty: 5, note: "" });
    expect(r.error).toBe("Stock cannot go below zero");
  });

  it("computes the delta needed to reach an exact count", () => {
    expect(computeStockDelta(10, { grade: "GEN", action: "set", qty: 7, note: "" })).toEqual({ delta: -3 });
  });

  it("allows setting an exact count of zero", () => {
    expect(computeStockDelta(10, { grade: "GEN", action: "set", qty: 0, note: "" })).toEqual({ delta: -10 });
  });

  it("rejects a zero quantity for in/out actions", () => {
    const r = computeStockDelta(10, { grade: "GEN", action: "in", qty: 0, note: "" });
    expect(r.error).toBe("Enter a quantity");
  });
});
