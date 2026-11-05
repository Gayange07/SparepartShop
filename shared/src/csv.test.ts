import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with embedded commas", () => {
    expect(parseCsv('a,"b, with comma",c')).toEqual([["a", "b, with comma", "c"]]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    expect(parseCsv('a,"he said ""hi""",c')).toEqual([["a", 'he said "hi"', "c"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("skips blank trailing lines", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
