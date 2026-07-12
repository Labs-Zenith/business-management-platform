import { describe, expect, it } from "vitest";
import { formatCOP, lineTotal, pesosToCents, roundHalfUp } from "./money";

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

describe("pesosToCents", () => {
  it("converts a whole-peso amount to cents", () => {
    expect(pesosToCents(500)).toBe(50000);
  });

  it("returns 0 for a 0 peso amount", () => {
    expect(pesosToCents(0)).toBe(0);
  });

  it.each([
    { pesos: 1.005, expectedCents: 101 },
    { pesos: 8.575, expectedCents: 858 },
    { pesos: 5.015, expectedCents: 502 },
  ])(
    "converts $pesos pesos to $expectedCents cents without IEEE-754 rounding-down artifacts",
    ({ pesos, expectedCents }) => {
      // A naive `Math.round(pesos * 100)` would silently round DOWN here
      // (e.g. `1.005 * 100` is `100.49999999999999`, not `100.5`).
      expect(pesosToCents(pesos)).toBe(expectedCents);
    },
  );
});
