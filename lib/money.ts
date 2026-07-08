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
