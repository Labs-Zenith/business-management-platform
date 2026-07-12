import type { Expense, ExpenseInput, ExpenseListQuery, ExpenseRepository, Paged } from "@/lib/services/ports";
import { sql } from "./client";

type ExpenseRow = {
  id: string;
  business_id: string;
  category: string;
  expense_date: string;
  description: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    businessId: row.business_id,
    category: row.category as Expense["category"],
    expenseDate: toDateStr(row.expense_date),
    description: row.description,
    amount: Number(row.amount),
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

/**
 * Mirrors `db/payment-repo.ts`: JS-side filter/sort/paginate after a single
 * business-scoped fetch — no speculative indexes (mirrors mock/expense-repo.ts).
 */
export const expenseRepo: ExpenseRepository = {
  async getById(businessId: string, id: string): Promise<Expense | null> {
    const rows = (await sql`SELECT * FROM expenses WHERE id = ${id}`) as unknown as ExpenseRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    return toExpense(row);
  },

  async list(businessId: string, query: ExpenseListQuery): Promise<Paged<Expense>> {
    const rows = (await sql`SELECT * FROM expenses WHERE business_id = ${businessId}`) as unknown as ExpenseRow[];
    let expenses = rows.map(toExpense);

    if (query.category) expenses = expenses.filter((e) => e.category === query.category);
    if (query.from) expenses = expenses.filter((e) => e.expenseDate >= query.from!);
    if (query.to) expenses = expenses.filter((e) => e.expenseDate <= query.to!);

    expenses.sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : -1));
    return paginate(expenses, query.page, query.pageSize);
  },

  async create(businessId: string, data: ExpenseInput): Promise<Expense> {
    const rows = (await sql`
      INSERT INTO expenses (id, business_id, category, expense_date, description, amount, notes)
      VALUES (gen_random_uuid(), ${businessId}, ${data.category}, ${data.expenseDate}, ${data.description}, ${data.amount}, ${data.notes ?? null})
      RETURNING *
    `) as unknown as ExpenseRow[];
    return toExpense(rows[0]!);
  },
};
