/**
 * Payroll period computation, per
 * `openspec/changes/nomina-payroll/design.md`'s "Period Computation" section
 * and `specs/payroll-management/spec.md`'s "Period Type Determines Computed
 * Period Range" requirement.
 *
 * The admin picks `periodType` ('quincenal' | 'mensual') plus a reference
 * date; `period_start`/`period_end` are always server-derived, never
 * client-supplied. `period_days` (day count) is intentionally NOT persisted
 * anywhere — it's always derivable as `periodEnd - periodStart + 1`, matching
 * this codebase's "don't store derivable values" convention (mirrors
 * invoice `status` being computed at read time, never stored).
 */

import type { PeriodType } from "./ports";

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * `referenceDate` is a "YYYY-MM-DD" string, parsed by string slice (NO `Date`
 * round-trip for the y/m/day components) — avoids any timezone shift. The
 * only `Date` use is `new Date(y, m, 0).getDate()`, a local-midnight
 * construction read only for day-of-month, which is TZ-stable and correctly
 * handles 28/29/30/31-day months (including leap-year February) without a
 * hardcoded lookup table.
 */
export function computePeriod(periodType: PeriodType, referenceDate: string): { periodStart: string; periodEnd: string } {
  const y = Number(referenceDate.slice(0, 4));
  const m = Number(referenceDate.slice(5, 7)); // 1-based month
  const day = Number(referenceDate.slice(8, 10));
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of month m+1 = last day of month m

  if (periodType === "mensual") {
    return { periodStart: iso(y, m, 1), periodEnd: iso(y, m, lastDay) };
  }

  // Intentional fallback: any `periodType` value other than "mensual" (not
  // just the literal "quincenal") is treated as quincenal here. Safe today
  // only because every internal caller is constrained by TypeScript to the
  // `'quincenal' | 'mensual'` union; the real runtime safety net for
  // untrusted input is the upstream `payrollPaymentCreateSchema`'s
  // `z.enum(["quincenal", "mensual"])` (PR2), not this function.
  return day <= 15
    ? { periodStart: iso(y, m, 1), periodEnd: iso(y, m, 15) }
    : { periodStart: iso(y, m, 16), periodEnd: iso(y, m, lastDay) };
}

/** Display-only day count, never persisted (matches "don't store derivable values"). */
export function periodDays(periodStart: string, periodEnd: string): number {
  return Math.round((Date.parse(periodEnd) - Date.parse(periodStart)) / 86_400_000) + 1;
}
