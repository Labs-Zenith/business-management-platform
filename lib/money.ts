/**
 * Money handling for the whole app.
 *
 * Convention: every monetary amount is an INTEGER MINOR UNIT (COP cents),
 * end to end (mock layer, services, schemas). The single rounding site is
 * `lineTotal`; do not scatter rounding logic anywhere else.
 */

/** Round-half-up to the nearest integer. Only used at `lineTotal`. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Computes a single invoice item's line total in integer cents.
 * `quantity` may be fractional (e.g. hours, kg); `unitPriceCents` is an
 * integer. Round-half-up is applied here and only here.
 */
export function lineTotal(quantity: number, unitPriceCents: number): number {
  return roundHalfUp(quantity * unitPriceCents);
}

/**
 * Formats integer cents as a COP currency string with no decimal digits.
 * UI-edge only — services, schemas, and the mock layer must never call this.
 */
export function formatCOP(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Converts a whole-COP-peso amount (as entered by a user, e.g. an invoice's
 * `unitPrice` or an expense/payment `amount`) into integer cents.
 *
 * UI-edge only — this is the single conversion site for "pesos typed by a
 * human" -> "integer minor units"; do not scatter `Math.round(x * 100)`
 * anywhere else. A plain `Math.round(pesos * 100)` silently rounds DOWN for
 * some 2-3 decimal amounts due to IEEE-754 float imprecision (e.g.
 * `1.005 * 100` is `100.49999999999999`, not `100.5`) — round-tripping
 * through `toFixed(2)` first normalizes that imprecision away before the
 * final rounding.
 *
 * Assumes `pesos >= 0`. `Math.round` rounds half-values toward zero for
 * negative inputs (e.g. `Math.round(-100.5)` is `-100`, not `-101`), which is
 * asymmetric with this function's round-half-up behavior for positive
 * amounts. This is not handled here — callers must reject negative amounts
 * upstream (both the client zod schema and the server already do).
 */
export function pesosToCents(pesos: number): number {
  return Math.round(Number((pesos * 100).toFixed(2)));
}
