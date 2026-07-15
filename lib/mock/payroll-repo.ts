import type {
  Expense,
  ExpenseInput,
  Paged,
  PayrollPayment,
  PayrollPaymentListQuery,
  PayrollPaymentPersist,
  PayrollPaymentRepository,
  PayrollPaymentWithEmployee,
} from "@/lib/services/ports";
import { generateId, resolveCatalogId, store as defaultStore, type MockStore } from "./store";

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

function toPayrollPaymentWithEmployee(store: MockStore, payment: PayrollPayment): PayrollPaymentWithEmployee {
  const employee = store.employees.get(payment.employeeId);
  return {
    ...payment,
    employee: { id: payment.employeeId, name: employee?.name ?? "" },
  };
}

/**
 * Append-only (list/getById/create only — no update/delete). `create` is the
 * critical part: it must insert the payroll payment AND its linked
 * `category:'nomina'` expense as one all-or-nothing unit. Single-threaded JS
 * gives trivial atomicity as long as there is NO `await`/microtask gap
 * between the two `Map.set()` calls — no other code path can observe a
 * partially-written state, because nothing can interleave between two
 * synchronous statements. Unlike `payment-repo.ts`/`customer-repo.ts`, this
 * `create` has NO `simulateLatency()` call for that exact reason.
 */
export function createPayrollRepository(store: MockStore): PayrollPaymentRepository {
  return {
    async list(businessId: string, query: PayrollPaymentListQuery): Promise<Paged<PayrollPaymentWithEmployee>> {
      let payments: PayrollPayment[] = [...store.payrollPayments.values()].filter(
        (payment) => payment.businessId === businessId,
      );

      if (query.employeeId) {
        payments = payments.filter((payment) => payment.employeeId === query.employeeId);
      }
      if (query.from) {
        payments = payments.filter((payment) => payment.paymentDate >= query.from!);
      }
      if (query.to) {
        payments = payments.filter((payment) => payment.paymentDate <= query.to!);
      }

      payments.sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1)); // newest first, matches expenses

      const withEmployee = payments.map((payment) => toPayrollPaymentWithEmployee(store, payment));
      return paginate(withEmployee, query.page, query.pageSize);
    },

    async getById(businessId: string, id: string): Promise<PayrollPaymentWithEmployee | null> {
      const payment = store.payrollPayments.get(id);
      if (!payment || payment.businessId !== businessId) {
        return null;
      }
      return toPayrollPaymentWithEmployee(store, payment);
    },

    async create(businessId: string, data: PayrollPaymentPersist, expense: ExpenseInput): Promise<PayrollPayment> {
      const now = new Date().toISOString();
      // `periodTypeId` resolved from `periodType`'s catalog code when the
      // caller doesn't supply one directly (no dropdown UI wires it yet —
      // Wave 2). `periodType` is always populated (required, enum-checked),
      // so this resolution always succeeds against the seeded catalog. An
      // explicitly-supplied `periodTypeId` is verified to actually exist in
      // the catalog first — defense in depth for any direct caller that
      // bypasses `payroll-service.ts#createPayrollPayment`'s own
      // `assertCatalogId` guard (see `resolveCatalogId`'s doc comment).
      const periodTypeId = resolveCatalogId(
        store.payrollPeriodTypes,
        data.periodTypeId,
        data.periodType,
        "periodTypeId",
      );
      const payment: PayrollPayment = {
        id: generateId(),
        businessId,
        employeeId: data.employeeId,
        amount: data.amount,
        periodType: data.periodType,
        periodTypeId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        paymentDate: data.paymentDate,
        notes: data.notes ?? null,
        createdAt: now,
      };
      const linkedExpenseCategoryId = resolveCatalogId(
        store.expenseCategories,
        expense.categoryId,
        expense.category,
        "categoryId",
      );
      const linkedExpense: Expense = {
        id: generateId(),
        businessId,
        category: expense.category,
        categoryId: linkedExpenseCategoryId,
        expenseDate: expense.expenseDate,
        description: expense.description,
        amount: expense.amount,
        notes: expense.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      // NO `await`/microtask gap between these two `Map.set()` calls — see
      // the module-level doc comment for why this is genuinely atomic.
      store.payrollPayments.set(payment.id, payment);
      store.expenses.set(linkedExpense.id, linkedExpense);

      return payment;
    },
  };
}

export const payrollRepo: PayrollPaymentRepository = createPayrollRepository(defaultStore);
