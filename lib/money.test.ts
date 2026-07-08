import { describe, expect, it } from "vitest";
import { formatCOP, lineTotal, roundHalfUp } from "./money";

describe("roundHalfUp", () => {
  it("rounds a fractional value up at the half boundary", () => {
    expect(roundHalfUp(499.5)).toBe(500);
  });

  it("leaves an already-integer value unchanged", () => {
    expect(roundHalfUp(999)).toBe(999);
  });

  it("rounds down when below the half boundary", () => {
    expect(roundHalfUp(499.4)).toBe(499);
  });
});

describe("lineTotal", () => {
  it("multiplies quantity by unit price in integer cents (no rounding needed)", () => {
    expect(lineTotal(3, 333)).toBe(999);
  });

  it("round-half-up applies when quantity * unitPrice produces a fractional cent", () => {
    // 1.5 * 333 = 499.5 -> rounds up to 500
    expect(lineTotal(1.5, 333)).toBe(500);
  });

  it("returns 0 when unit price is 0", () => {
    expect(lineTotal(5, 0)).toBe(0);
  });
});

describe("formatCOP", () => {
  it("formats integer cents as COP currency with no decimal digits", () => {
    expect(formatCOP(500000)).toBe("$ 5.000");
  });

  it("formats zero cents", () => {
    expect(formatCOP(0)).toBe("$ 0");
  });
});
