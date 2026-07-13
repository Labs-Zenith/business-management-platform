import { describe, expect, it } from "vitest";

import { maskOptionsForCurrency, type NumericMaskOptions } from "@/lib/format/numeric-mask";
import { caretIndexAfterSignificant, countSignificantBefore } from "./money-input";

/**
 * Direct unit tests for the pure caret-math helpers behind `MoneyInput`'s
 * imperative DOM reconciliation. These are string/number in, number out —
 * DOM-independent — so they're exercised here without jsdom or rendering.
 */

const moneyOpts: NumericMaskOptions = maskOptionsForCurrency("COP", {
  allowDecimals: true,
  maxDecimals: 2,
});
const quantityOpts: NumericMaskOptions = maskOptionsForCurrency("COP", {
  allowDecimals: false,
  maxDecimals: 0,
});

describe("countSignificantBefore", () => {
  const display = "150.000"; // digits: 1 5 0 . 0 0 0 (the "." is grouping, NOT significant)

  it("counts 0 significant chars before caret 0", () => {
    expect(countSignificantBefore(display, 0, moneyOpts)).toBe(0);
  });

  it("counts digits before the grouping separator", () => {
    expect(countSignificantBefore(display, 3, moneyOpts)).toBe(3); // "150" — caret right before "."
  });

  it("does not count the grouping separator itself as significant", () => {
    // caret at index 4 is right after "150." — the "." must not be counted.
    expect(countSignificantBefore(display, 4, moneyOpts)).toBe(3);
  });

  it("counts all digits when caret is at the end", () => {
    expect(countSignificantBefore(display, display.length, moneyOpts)).toBe(6);
  });

  it("treats the decimal separator as significant (it becomes part of the raw value)", () => {
    const withDecimal = "150.000,5"; // "," is the decimal separator for COP
    // caret right after "," (index 8) — 6 digits + 1 decimal separator = 7 significant chars.
    expect(countSignificantBefore(withDecimal, 8, moneyOpts)).toBe(7);
  });

  it("clamps to the string length when caret is past the end", () => {
    expect(countSignificantBefore(display, display.length + 10, moneyOpts)).toBe(6);
  });
});

describe("caretIndexAfterSignificant", () => {
  it("returns 0 when sig is 0", () => {
    expect(caretIndexAfterSignificant("150.000", 0, moneyOpts)).toBe(0);
  });

  it("returns 0 when sig is negative", () => {
    expect(caretIndexAfterSignificant("150.000", -1, moneyOpts)).toBe(0);
  });

  it("finds the index right after the Nth significant char in a grouped display", () => {
    // "150.000" -> significant chars are 1,5,0,0,0,0 at indices 0,1,2,4,5,6.
    expect(caretIndexAfterSignificant("150.000", 3, moneyOpts)).toBe(3); // after "150"
    expect(caretIndexAfterSignificant("150.000", 4, moneyOpts)).toBe(5); // after "150.0" (skips ".")
    expect(caretIndexAfterSignificant("150.000", 6, moneyOpts)).toBe(7); // after all digits
  });

  it("finds the position after the Nth significant char in a grouped+decimal display", () => {
    const display = "1.500.000,25";
    // significant chars in order: 1,5,0,0,0,0,0,',',2,5
    expect(caretIndexAfterSignificant(display, 1, moneyOpts)).toBe(1); // after "1"
    expect(caretIndexAfterSignificant(display, 7, moneyOpts)).toBe(9); // after "1.500.000" (7th digit)
    expect(caretIndexAfterSignificant(display, 8, moneyOpts)).toBe(10); // after the decimal separator ","
    expect(caretIndexAfterSignificant(display, 10, moneyOpts)).toBe(12); // after "25" (end of string)
  });

  it("returns display.length when sig exceeds the number of significant chars available", () => {
    expect(caretIndexAfterSignificant("150.000", 99, moneyOpts)).toBe("150.000".length);
  });

  it("works the same way for quantity-mode displays (no decimal separator present)", () => {
    expect(caretIndexAfterSignificant("1.000", 4, quantityOpts)).toBe(5);
  });
});
