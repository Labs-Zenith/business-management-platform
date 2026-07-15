/**
 * Catalog service — thin read-only pass-through to `repositories.catalog`,
 * per Wave 1A's "data-model foundation" scope. No `Session`/`businessId`
 * argument on any function: these are global, business-agnostic reference
 * tables (`invoice_types`, `expense_categories`, `payment_methods`,
 * `movement_types`, `payroll_period_types`), not multi-tenant data.
 *
 * Wave 2 will consume these to back dropdown/select UI on the invoice,
 * expense, payment, inventory-movement, and payroll-payment forms.
 *
 * `assertCatalogId` is the shared existence guard every `*-service.ts`
 * create path calls BEFORE forwarding a caller-supplied `categoryId`/
 * `methodId`/`typeId`/`periodTypeId`/`invoiceTypeId` to a repository — a
 * well-formed but nonexistent catalog id must fail with a clean
 * `VALIDATION_ERROR` (400) at this layer, identically for both backends,
 * rather than either silently writing a dangling FK (mock) or surfacing a
 * raw FK-violation 500 (DB). See each service's create function for the
 * call site.
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type { CatalogItem, InvoiceType } from "@/lib/services/ports";

/**
 * Throws `ApiError("VALIDATION_ERROR", ...)` when `id` has no matching entry
 * in `list` (by `id`, not `code`). Callers only invoke this when the create
 * input actually supplied an explicit id — the established "resolve from
 * the enum-validated code" fallback (used when no id is supplied) is never
 * routed through here and stays exactly as safe as before.
 */
export function assertCatalogId(list: CatalogItem[], id: string, fieldName: string): void {
  if (!list.some((item) => item.id === id)) {
    throw new ApiError("VALIDATION_ERROR", `Invalid ${fieldName}: no matching catalog entry.`, { field: fieldName, id });
  }
}

export async function listInvoiceTypes(): Promise<InvoiceType[]> {
  return repositories.catalog.listInvoiceTypes();
}

export async function listExpenseCategories(): Promise<CatalogItem[]> {
  return repositories.catalog.listExpenseCategories();
}

export async function listPaymentMethods(): Promise<CatalogItem[]> {
  return repositories.catalog.listPaymentMethods();
}

export async function listMovementTypes(): Promise<CatalogItem[]> {
  return repositories.catalog.listMovementTypes();
}

export async function listPayrollPeriodTypes(): Promise<CatalogItem[]> {
  return repositories.catalog.listPayrollPeriodTypes();
}
