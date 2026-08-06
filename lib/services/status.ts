/**
 * Invoice status computation (`docs/database-model.md` "Estado de factura").
 *
 * Precedence, evaluated in this exact order:
 *   1. balance <= 0                              -> "paid"
 *   2. balance > 0 AND at least one payment       -> "partially_paid"
 *   3. balance > 0, no payments, dueDate null/future -> "pending"
 *   4. balance > 0, no payments, dueDate passed   -> "overdue"
 *
 * Rule 2 is checked BEFORE rule 4: a partially paid invoice that is also
 * past its due date stays "partially_paid", never "overdue".
 *
 * `"voided"` is part of the union but `computeStatus` NEVER returns it: it is
 * not derivable from total/paid/dueDate. It comes from the persisted
 * `invoices.voided_at` marker and is imposed by each repo's `withFinance`,
 * which short-circuits before calling this function. Keeping it in the same
 * union is what makes the list filter, the badge and every `InvoiceStatus`
 * consumer handle it exhaustively.
 */

import { todayIsoDateInAppZone } from "@/lib/dates";

export type InvoiceStatus = "pending" | "partially_paid" | "paid" | "overdue" | "voided";

export function computeStatus(
  total: number,
  paid: number,
  dueDate: string | Date | null,
  now: Date = new Date(),
): InvoiceStatus {
  const balance = total - paid;

  if (balance <= 0) {
    return "paid";
  }

  if (paid > 0) {
    return "partially_paid";
  }

  if (dueDate === null) {
    return "pending";
  }

  // Calendar-day comparison, not an instant comparison: "dueDate passed"
  // means the CALENDAR DAY has passed, not that fewer than 24h remain. Both
  // sides are normalized to `YYYY-MM-DD` in the business's own timezone
  // (`APP_TIME_ZONE`, Colombia) via `todayIsoDateInAppZone`, then compared
  // lexically — the same string-range convention `dashboard-period.ts` uses
  // for its `from`/`to` bounds. All 8 production callers already pass
  // `dueDate` as a `YYYY-MM-DD` string, so it needs no conversion; the `Date`
  // branch only exists to satisfy the `string | Date` type contract (dead in
  // production) and is normalized through the same helper for consistency.
  //
  // Comparing `new Date(dueDate).getTime() >= now.getTime()` (the previous
  // implementation) compared INSTANTS instead: `new Date("2026-08-06")`
  // parses as UTC midnight, which is already 2026-08-05T19:00 in Bogota
  // (UTC-5) — so an invoice due "tomorrow" read as "overdue" hours early.
  const dueIsoDate = dueDate instanceof Date ? todayIsoDateInAppZone(dueDate) : dueDate;
  const todayIsoDate = todayIsoDateInAppZone(now);
  return dueIsoDate >= todayIsoDate ? "pending" : "overdue";
}
