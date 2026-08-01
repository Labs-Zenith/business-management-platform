/**
 * Builds the dashboard period selector's contents from REAL data: only months
 * in which the business actually recorded something are offered, so a user
 * can never pick a month that is guaranteed to render empty.
 *
 * Deliberately a separate module from `lib/services/dashboard-period.ts`:
 * that one is pure, synchronous and sessionless (it is imported by
 * `app/api/dashboard/{summary,export}/route.ts` purely for `parsePeriodParam`,
 * and its whole unit-test suite runs with an injected `now` and zero stubs).
 * Pulling `repositories` — and with it all of `lib/db`/`lib/mock` — into that
 * file would forfeit both properties.
 *
 * "Active month" is the union of the three sources the dashboard actually
 * renders: invoices (`issueDate`), payments (`paymentDate`) and expenses
 * (`expenseDate`). Payroll is deliberately excluded — it does not appear on
 * the dashboard, and payroll payments already surface as expenses.
 */

import { repositories } from "@/lib/services/repositories";
import type { Session } from "@/lib/services/ports";
import {
  MONTH_KEY_PATTERN,
  monthKey,
  monthLongLabel,
  presetOptions,
  type PeriodOption,
} from "@/lib/services/dashboard-period";

export type PeriodOptions = {
  presets: PeriodOption[];
  /** Newest first — the months a user actually reaches for are the recent ones. */
  months: PeriodOption[];
};

export async function getPeriodOptions(session: Session, now: Date = new Date()): Promise<PeriodOptions> {
  const currentMonth = monthKey(now);

  const [invoiceMonths, paymentMonths, expenseMonths] = await Promise.all([
    repositories.invoices.listActiveMonths(session.businessId),
    repositories.payments.listActiveMonths(session.businessId),
    repositories.expenses.listActiveMonths(session.businessId),
  ]);

  const months = [
    // The current month is unioned in unconditionally: without it, a
    // brand-new business (or the first days of a month with no movement yet)
    // would get an empty "Meses" group and no way to select the default
    // period the page already resolves to.
    currentMonth,
    ...invoiceMonths,
    ...paymentMonths,
    ...expenseMonths,
  ]
    // Defensive: a malformed or future-dated row must never become an option
    // that `parsePeriodParam` would then reject, silently bouncing the user
    // back to the current month.
    .filter((month) => MONTH_KEY_PATTERN.test(month) && month <= currentMonth);

  return {
    presets: presetOptions(),
    months: [...new Set(months)]
      .sort()
      .reverse()
      .map((month) => ({ value: month, label: monthLongLabel(month) })),
  };
}
