import type { CatalogItem, CatalogRepository, InvoiceType } from "@/lib/services/ports";
import { sql } from "./client";

/**
 * Read-only, business-agnostic catalog lookups (Wave 1A foundation for Wave
 * 2's dropdowns). Every table is small and global — no `business_id` scoping,
 * no pagination. Mirrors `db/employee-repo.ts`'s simple parameterized-query
 * strategy, minus any per-business filter.
 */

type CatalogRow = {
  id: string;
  code: string;
  label: string;
  active: boolean;
};

type InvoiceTypeRow = CatalogRow & { prefix: string };

function toCatalogItem(row: CatalogRow): CatalogItem {
  return { id: row.id, code: row.code, label: row.label, active: row.active };
}

function toInvoiceType(row: InvoiceTypeRow): InvoiceType {
  return { ...toCatalogItem(row), prefix: row.prefix };
}

export const catalogRepo: CatalogRepository = {
  async listInvoiceTypes(): Promise<InvoiceType[]> {
    const rows = (await sql`SELECT * FROM invoice_types ORDER BY label`) as unknown as InvoiceTypeRow[];
    return rows.map(toInvoiceType);
  },

  async listExpenseCategories(): Promise<CatalogItem[]> {
    const rows = (await sql`SELECT * FROM expense_categories ORDER BY label`) as unknown as CatalogRow[];
    return rows.map(toCatalogItem);
  },

  async listPaymentMethods(): Promise<CatalogItem[]> {
    const rows = (await sql`SELECT * FROM payment_methods ORDER BY label`) as unknown as CatalogRow[];
    return rows.map(toCatalogItem);
  },

  async listMovementTypes(): Promise<CatalogItem[]> {
    const rows = (await sql`SELECT * FROM movement_types ORDER BY label`) as unknown as CatalogRow[];
    return rows.map(toCatalogItem);
  },

  async listPayrollPeriodTypes(): Promise<CatalogItem[]> {
    const rows = (await sql`SELECT * FROM payroll_period_types ORDER BY label`) as unknown as CatalogRow[];
    return rows.map(toCatalogItem);
  },
};
