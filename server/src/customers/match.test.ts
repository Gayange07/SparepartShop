import { describe, expect, it } from "vitest";

process.env.DB_PATH = ":memory:";
const { localDigits } = await import("./match.js");

describe("localDigits", () => {
  it("treats +94 and leading-0 forms of a Sri Lankan number as the same", () => {
    expect(localDigits("+94 77 559 6560")).toBe("0775596560");
    expect(localDigits("077-559-6560")).toBe("0775596560");
    expect(localDigits("(077) 5596560")).toBe("0775596560");
  });

  it("leaves other numbers as plain digits", () => {
    expect(localDigits("091 222 2222")).toBe("0912222222");
    expect(localDigits("12345")).toBe("12345");
  });
});
