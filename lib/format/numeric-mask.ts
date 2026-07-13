/**
 * Currency-aware numeric masking for money/quantity form inputs.
 *
 * The value exchanged with a parent component (the "raw" string) is always
 * JS-parseable: it uses `.` as the decimal point and carries NO grouping
 * separators, e.g. `"150000"` or `"150000.5"`; empty is `""`. `Number(raw)`
 * (or `Number.isNaN` check on a non-empty raw) always works. This is the
 * single conversion boundary between "what the user typed" and "a value a
 * parent can safely call `Number(...)` on" — do not scatter ad-hoc parsing
 * elsewhere.
 */

export type NumericMaskOptions = {
  /** true = money (decimals allowed), false = quantity (integers only). */
  allowDecimals: boolean;
  /** 2 for money, 0 for quantity. */
  maxDecimals: number;
  /** "." for COP. */
  groupSeparator: string;
  /** "," for COP. */
  decimalSeparator: string;
};

type CurrencySeparators = Pick<NumericMaskOptions, "groupSeparator" | "decimalSeparator">;

/**
 * Lookup of locale-specific grouping/decimal separators by currency code.
 * Today only COP is a real business requirement. Any unrecognized code
 * falls back to the COP entry — this is a deliberate seam for future
 * currencies rather than a bug: when a second currency is actually needed,
 * add its entry here instead of changing the fallback behavior.
 */
const CURRENCY_SEPARATORS: Record<string, CurrencySeparators> = {
  COP: { groupSeparator: ".", decimalSeparator: "," },
};

export function maskOptionsForCurrency(
  currencyCode: string,
  opts: { allowDecimals: boolean; maxDecimals: number },
): NumericMaskOptions {
  const separators = CURRENCY_SEPARATORS[currencyCode] ?? CURRENCY_SEPARATORS.COP;
  return { ...separators, ...opts };
}

/**
 * Converts whatever text currently sits in the `<input>` (a mix of digits,
 * grouping artifacts, and possibly a typed decimal separator) into the
 * canonical RAW string described above.
 */
export function sanitizeRawInput(typedText: string, opts: NumericMaskOptions): string {
  const { allowDecimals, maxDecimals, groupSeparator, decimalSeparator } = opts;

  let integerDigits = "";
  let decimalDigits = "";
  let hasDecimal = false;

  for (const char of typedText) {
    if (char >= "0" && char <= "9") {
      if (hasDecimal) {
        // Cap digits after the decimal separator to maxDecimals — truncate,
        // never round, any extra digits.
        if (decimalDigits.length < maxDecimals) {
          decimalDigits += char;
        }
      } else {
        integerDigits += char;
      }
      continue;
    }

    if (char === groupSeparator) {
      // Deliberate: `.` (the grouping character) is ALWAYS a grouping
      // artifact and is stripped, never treated as an alternate decimal
      // point. This eliminates the "is this dot decimal or grouping"
      // ambiguity entirely, at the cost of requiring a distinct
      // decimalSeparator character (`,` for COP).
      continue;
    }

    if (allowDecimals && char === decimalSeparator && !hasDecimal) {
      hasDecimal = true;
      continue;
    }

    // Any other character — a repeated decimal separator, a decimal
    // separator typed in quantity mode, stray text, etc. — is dropped.
  }

  // Strip leading zeros in the integer part, but keep a single "0" when the
  // value is 0 or 0.x.
  let intPart = integerDigits.replace(/^0+(?=\d)/, "");
  if (intPart === "" && (hasDecimal || integerDigits.length > 0)) {
    intPart = "0";
  }

  if (intPart === "" && !hasDecimal) {
    return "";
  }

  return hasDecimal ? `${intPart}.${decimalDigits}` : intPart;
}

/** Groups a digit-only string every 3 digits from the right. */
function groupThousands(digits: string, separator: string): string {
  if (digits === "") return digits;
  const reversedChunks = digits.split("").reverse().join("").match(/.{1,3}/g) ?? [];
  return reversedChunks.join(separator).split("").reverse().join("");
}

/**
 * Formats a canonical RAW string (see module doc) for display, applying
 * thousands grouping and the locale decimal separator. Inverse of
 * `sanitizeRawInput`, except it also gracefully handles the in-progress
 * "user just typed the decimal separator" case (a trailing `.` in raw).
 */
export function formatForDisplay(rawValue: string, opts: NumericMaskOptions): string {
  if (rawValue === "") return "";

  const { groupSeparator, decimalSeparator } = opts;
  const [intPart = "", decPart] = rawValue.split(".");
  const groupedInt = groupThousands(intPart, groupSeparator);

  if (decPart === undefined) {
    return groupedInt;
  }

  return `${groupedInt}${decimalSeparator}${decPart}`;
}
