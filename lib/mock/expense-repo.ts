import type { Expense, ExpenseInput, ExpenseListQuery, ExpenseRepository, Paged } from "@/lib/services/ports";
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

/**
 * Mirrors `payment-repo.ts`'s structure minus `toPaymentWithRefs`/`withLock`/
 * `simulateLatency` — expenses have no invoice/customer joins, no balance
 * invariant, and `create` is a single synchronous insert with no
 * read-check-write race to guard against.
 */
export function createExpenseRepository(store: MockStore): ExpenseRepository {
  return {
    async getById(businessId: string, id: string): Promise<Expense | null> {
      const expense = store.expenses.get(id);
      if (!expense || expense.businessId !== businessId) {
        // Cross-business or missing: `null`, never leaked — matches
        // `paymentRepo.getById`'s convention.
        return null;
      }
      return expense;
    },

    async list(businessId: string, query: ExpenseListQuery): Promise<Paged<Expense>> {
      let expenses = [...store.expenses.values()].filter((expense) => expense.businessId === businessId);

      if (query.category) {
        expenses = expenses.filter((expense) => expense.category === query.category);
      }
      if (query.from) {
        expenses = expenses.filter((expense) => expense.expenseDate >= query.from!);
      }
      if (query.to) {
        expenses = expenses.filter((expense) => expense.expenseDate <= query.to!);
      }

      expenses.sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : -1)); // newest first, matches payments

      return paginate(expenses, query.page, query.pageSize);
    },

    async create(businessId: string, data: ExpenseInput): Promise<Expense> {
      const now = new Date().toISOString();
      // `categoryId` is resolved from `category`'s catalog code when the
      // caller doesn't supply one directly (no dropdown UI wires it yet —
      // Wave 2). `category` is always populated (required, enum-checked), so
      // this resolution always succeeds against the seeded catalog. An
      // explicitly-supplied `categoryId` is verified to actually exist in
      // the catalog first — defense in depth for any direct caller that
      // bypasses `expense-service.ts#createExpense`'s own `assertCatalogId`
      // guard (see `resolveCatalogId`'s doc comment).
      const categoryId = resolveCatalogId(store.expenseCategories, data.categoryId, data.category, "categoryId");
      const expense: Expense = {
        id: generateId(),
        businessId, // ALWAYS from arg, never from data
        category: data.category,
        categoryId,
        expenseDate: data.expenseDate,
        description: data.description,
        amount: data.amount,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      store.expenses.set(expense.id, expense);
      return expense;
    },
  };
}

export const expenseRepo: ExpenseRepository = createExpenseRepository(defaultStore);
