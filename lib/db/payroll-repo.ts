import type {
  ExpenseInput,
  Paged,
  PayrollPayment,
  PayrollPaymentListQuery,
  PayrollPaymentPersist,
  PayrollPaymentRepository,
  PayrollPaymentWithEmployee,
} from "@/lib/services/ports";
import { sql } from "./client";

/**
 * `create` is the codebase's FIRST true multi-statement transaction. Uses
 * the Neon HTTP driver's `sql.transaction([...])` (confirmed in
 * `node_modules/@neondatabase/serverless/index.d.ts` — `NeonQueryFunction.transaction`),
 * which runs an array of queries as a single non-interactive Postgres
 * transaction over one HTTPS request (atomic: both succeed or neither
 * persists). The two INSERTs here are data-independent (no FK between
 * `expenses` and `payroll_payments`, neither needs the other's generated
 * id), so the driver's only limitation — non-interactive, can't feed one
 * query's result into another within the same call — does not apply.
 */

type PayrollPaymentRow = {
  id: string;
  business_id: string;
  employee_id: string;
  amount: number;
  period_type: string;
  period_start: string;
  period_end: string;
  payment_date: string;
  notes: string | null;
  created_at: string;
};

type EmployeeNameRow = { id: string; name: string };

function toDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toPayrollPayment(row: PayrollPaymentRow): PayrollPayment {
  return {
    id: row.id,
    businessId: row.business_id,
    employeeId: row.employee_id,
    amount: Number(row.amount),
    periodType: row.period_type as PayrollPayment["periodType"],
    periodStart: toDateStr(row.period_start),
    periodEnd: toDateStr(row.period_end),
    paymentDate: toDateStr(row.payment_date),
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

export const payrollRepo: PayrollPaymentRepository = {
  async list(businessId: string, query: PayrollPaymentListQuery): Promise<Paged<PayrollPaymentWithEmployee>> {
    const rows = (await sql`SELECT * FROM payroll_payments WHERE business_id = ${businessId}`) as unknown as PayrollPaymentRow[];
    const employeeRows = (await sql`SELECT id, name FROM employees WHERE business_id = ${businessId}`) as unknown as EmployeeNameRow[];

    let payments = rows.map(toPayrollPayment);

    if (query.employeeId) payments = payments.filter((p) => p.employeeId === query.employeeId);
    if (query.from) payments = payments.filter((p) => p.paymentDate >= query.from!);
    if (query.to) payments = payments.filter((p) => p.paymentDate <= query.to!);

    payments.sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));

    const withEmployee: PayrollPaymentWithEmployee[] = payments.map((p) => {
      const employee = employeeRows.find((e) => String(e.id) === String(p.employeeId));
      return { ...p, employee: { id: p.employeeId, name: employee?.name ?? "" } };
    });

    return paginate(withEmployee, query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<PayrollPaymentWithEmployee | null> {
    const rows = (await sql`SELECT * FROM payroll_payments WHERE id = ${id}`) as unknown as PayrollPaymentRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;

    const employeeRows = (await sql`SELECT id, name FROM employees WHERE id = ${row.employee_id}`) as unknown as EmployeeNameRow[];
    const payment = toPayrollPayment(row);
    return { ...payment, employee: { id: payment.employeeId, name: employeeRows[0]?.name ?? "" } };
  },

  async create(businessId: string, data: PayrollPaymentPersist, expense: ExpenseInput): Promise<PayrollPayment> {
    // `as unknown as Parameters<typeof sql.transaction>[0]`: each tagged-
    // template call below infers a slightly different `NeonQueryPromise`
    // instantiation (one has a `RETURNING *` result shape, the other does
    // not), which the driver's homogeneous-array `transaction()` signature
    // can't unify on its own — this cast is purely a TS ergonomics fix, not
    // a behavior change; both queries still run as one real transaction.
    const queries = [
      sql`INSERT INTO payroll_payments
            (id, business_id, employee_id, amount, period_type, period_start, period_end, payment_date, notes)
          VALUES (gen_random_uuid(), ${businessId}, ${data.employeeId}, ${data.amount}, ${data.periodType},
                  ${data.periodStart}, ${data.periodEnd}, ${data.paymentDate}, ${data.notes ?? null})
          RETURNING *`,
      sql`INSERT INTO expenses (id, business_id, category, expense_date, description, amount, notes)
          VALUES (gen_random_uuid(), ${businessId}, ${expense.category}, ${expense.expenseDate}, ${expense.description},
                  ${expense.amount}, ${expense.notes ?? null})`,
    ];
    const runTransaction = sql.transaction as (queries: unknown[]) => Promise<unknown[]>;

    const [payrollRows] = (await runTransaction(queries)) as unknown as [PayrollPaymentRow[], unknown];

    return toPayrollPayment(payrollRows[0]!);
  },
};
