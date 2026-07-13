import { describe, expect, it } from "vitest";
import {
  formatForDisplay,
  maskOptionsForCurrency,
  sanitizeRawInput,
  type NumericMaskOptions,
} from "./numeric-mask";

const moneyOpts: NumericMaskOptions = maskOptionsForCurrency("COP", {
  allowDecimals: true,
  maxDecimals: 2,
});
const quantityOpts: NumericMaskOptions = maskOptionsForCurrency("COP", {
  allowDecimals: false,
  maxDecimals: 0,
});

describe("maskOptionsForCurrency", () => {
  it("returns the COP grouping/decimal separators for 'COP'", () => {
    expect(maskOptionsForCurrency("COP", { allowDecimals: true, maxDecimals: 2 })).toEqual({
      groupSeparator: ".",
      decimalSeparator: ",",
      allowDecimals: true,
      maxDecimals: 2,
    });
  });

  it("falls back to the COP entry for an unrecognized currency code (future-currency seam)", () => {
    expect(maskOptionsForCurrency("USD", { allowDecimals: true, maxDecimals: 2 })).toEqual({
      groupSeparator: ".",
      decimalSeparator: ",",
      allowDecimals: true,
      maxDecimals: 2,
    });
  });

  it("merges the passed allowDecimals/maxDecimals into the resolved options", () => {
    expect(maskOptionsForCurrency("COP", { allowDecimals: false, maxDecimals: 0 })).toEqual({
      groupSeparator: ".",
      decimalSeparator: ",",
      allowDecimals: false,
      maxDecimals: 0,
    });
  });
});

describe("sanitizeRawInput", () => {
  it("returns '' for empty input", () => {
    expect(sanitizeRawInput("", moneyOpts)).toBe("");
  });

  it("passes plain integers through unchanged", () => {
    expect(sanitizeRawInput("12345", moneyOpts)).toBe("12345");
  });

  it("always strips '.' as a grouping artifact, never as a decimal point", () => {
    expect(sanitizeRawInput("1.234", moneyOpts)).toBe("1234");
    expect(sanitizeRawInput("1.234.567", moneyOpts)).toBe("1234567");
  });

  it("keeps the first ',' typed and represents it as '.' in the raw output", () => {
    expect(sanitizeRawInput("150000,5", moneyOpts)).toBe("150000.5");
  });

  it("drops any ',' typed after the first one, continuing to collect decimal digits", () => {
    expect(sanitizeRawInput("1,5,6", moneyOpts)).toBe("1.56");
  });

  it("truncates decimal digits beyond maxDecimals instead of rounding", () => {
    expect(sanitizeRawInput("1,999", moneyOpts)).toBe("1.99");
  });

  it("strips leading zeros in the integer part", () => {
    expect(sanitizeRawInput("007", moneyOpts)).toBe("7");
  });

  it("keeps a single '0' when the value is exactly 0", () => {
    expect(sanitizeRawInput("0", moneyOpts)).toBe("0");
  });

  it("keeps the leading '0' for a 0.x decimal value", () => {
    expect(sanitizeRawInput("0,5", moneyOpts)).toBe("0.5");
  });

  it("keeps a trailing decimal point for the in-progress '150,' case", () => {
    expect(sanitizeRawInput("150,", moneyOpts)).toBe("150.");
  });

  it("never emits ',' in the output", () => {
    expect(sanitizeRawInput("150000,5", moneyOpts)).not.toContain(",");
  });

  it("rejects a typed ',' in quantity mode (allowDecimals: false)", () => {
    expect(sanitizeRawInput("12,5", quantityOpts)).toBe("125");
  });

  it("strips non-numeric garbage from a paste, keeping only digits", () => {
    expect(sanitizeRawInput("abc123", moneyOpts)).toBe("123");
  });

  it("strips a stray 'e' (e.g. from a pasted exponential-looking string)", () => {
    expect(sanitizeRawInput("1e5", moneyOpts)).toBe("15");
  });

  it("strips currency symbols from a paste", () => {
    expect(sanitizeRawInput("$100", moneyOpts)).toBe("100");
  });

  it("treats a leading ',' with no integer digits as '0.x'", () => {
    expect(sanitizeRawInput(",5", moneyOpts)).toBe("0.5");
  });

  it("strips leading zeros in the integer part even when a decimal follows", () => {
    // Leading-zero stripping applies to the integer part regardless of the
    // decimal part — "007" -> "7", then the decimal digits are appended.
    expect(sanitizeRawInput("007,5", moneyOpts)).toBe("7.5");
  });

  it("round-trips the in-progress trailing-comma case through sanitize + format", () => {
    const raw = sanitizeRawInput("150,", moneyOpts);
    expect(raw).toBe("150.");
    expect(formatForDisplay(raw, moneyOpts)).toBe("150,");
  });

  it("parses a fully-grouped + decimal paste into the canonical raw string", () => {
    expect(sanitizeRawInput("1.500.000,25", moneyOpts)).toBe("1500000.25");
  });

  it("drops a typed ',' in quantity mode and keeps appending digits to the integer part", () => {
    // Quantity mode never enters "hasDecimal" state, so digits typed after a
    // dropped ',' are appended straight to the integer digits — there is no
    // silent digit loss, just no decimal point in the output.
    expect(sanitizeRawInput("150,5", quantityOpts)).toBe("1505");
  });

  it("strips a typed '-' — all amounts/quantities in this app are non-negative", () => {
    expect(sanitizeRawInput("-150", moneyOpts)).toBe("150");
  });
});

describe("formatForDisplay", () => {
  it("returns '' for an empty raw value", () => {
    expect(formatForDisplay("", moneyOpts)).toBe("");
  });

  it("does not group amounts under 4 digits", () => {
    expect(formatForDisplay("123", moneyOpts)).toBe("123");
  });

  it("groups at 6 digits", () => {
    expect(formatForDisplay("123456", moneyOpts)).toBe("123.456");
  });

  it("groups at 9 digits", () => {
    expect(formatForDisplay("123456789", moneyOpts)).toBe("123.456.789");
  });

  it("renders the decimal part with the decimal separator", () => {
    expect(formatForDisplay("150000.5", moneyOpts)).toBe("150.000,5");
  });

  it("shows a trailing decimal separator for the in-progress '150.' raw value", () => {
    expect(formatForDisplay("150.", moneyOpts)).toBe("150,");
  });

  it("groups quantity-mode values the same way, with no decimal part", () => {
    expect(formatForDisplay("1000", quantityOpts)).toBe("1.000");
  });
});
