/**
 * Payroll payment service, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Atomic Payment-to-Expense Linkage" requirement and `design.md`'s resolved
 * approach.
 *
 * `createPayrollPayment` computes the period range server-side, re-validates
 * the derived expense payload with `expenseCreateSchema` (validation reuse
 * ONLY — NOT `createExpense()` execution, since that awaits a separate HTTP
 * round-trip that cannot be composed into `repositories.payroll.create`'s
 * `sql.transaction`), then hands both payloads to the repository, which owns
 * the atomic two-insert.
 *
 * "Payroll payments can only be recorded for active employees" is enforced
 * HERE (server-side, via `employee.active`), not just by the Nomina page's
 * client-side dropdown pre-filter — a same-business authenticated user could
 * otherwise bypass the UI and POST an inactive employee's id directly.
 */

import { expenseCreateSchema } from "@/lib/schemas/expense";
import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import { computePeriod } from "@/lib/services/payroll-period";
import type { Paged, PayrollPayment, PayrollPaymentInput, PayrollPaymentListQuery, PayrollPaymentWithEmployee, Session } from "@/lib/services/ports";

export async function listPayrollPayments(
  session: Session,
  query: PayrollPaymentListQuery,
): Promise<Paged<PayrollPaymentWithEmployee>> {
  return repositories.payroll.list(session.businessId, query);
}

/**
 * Reserved: no route calls this yet — there is no single-payment GET this
 * phase (append-only records are only ever listed, never viewed/edited
 * individually). Kept for a likely future payment-detail drill-down and
 * exercised directly by this file's own tests in the meantime.
 */
export async function getPayrollPayment(session: Session, id: string): Promise<PayrollPaymentWithEmployee> {
  const payment = await repositories.payroll.getById(session.businessId, id);
  if (!payment) {
    throw new ApiError("NOT_FOUND", "Payroll payment not found.");
  }
  return payment;
}

export async function createPayrollPayment(session: Session, input: PayrollPaymentInput): Promise<PayrollPayment> {
  const employee = await repositories.employees.getById(session.businessId, input.employeeId);
  if (!employee) {
    throw new ApiError("NOT_FOUND", "Employee not found.");
  }
  if (!employee.active) {
    throw new ApiError("VALIDATION_ERROR", "Cannot record a payroll payment for an inactive employee.");
  }

  const { periodStart, periodEnd } = computePeriod(input.periodType, input.referenceDate);

  const parsed = expenseCreateSchema.safeParse({
    category: "nomina",
    expenseDate: input.paymentDate,
    description: `Nomina ${employee.name} (${periodStart} - ${periodEnd})`,
    amount: input.amount,
    notes: input.notes ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid payroll expense payload.", parsed.error.flatten());
  }

  return repositories.payroll.create(
    session.businessId,
    {
      employeeId: employee.id,
      amount: input.amount,
      periodType: input.periodType,
      periodStart,
      periodEnd,
      paymentDate: input.paymentDate,
      notes: input.notes ?? null,
    },
    {
      category: "nomina",
      expenseDate: parsed.data.expenseDate,
      description: parsed.data.description,
      amount: parsed.data.amount,
      notes: parsed.data.notes ?? null,
    },
  );
}
