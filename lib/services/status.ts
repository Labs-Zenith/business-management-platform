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
 */

export type InvoiceStatus = "pending" | "partially_paid" | "paid" | "overdue";

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

  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  return due.getTime() >= now.getTime() ? "pending" : "overdue";
}
