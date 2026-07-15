import type { CatalogItem, CatalogRepository, InvoiceType } from "@/lib/services/ports";
import { store as defaultStore, type MockStore } from "./store";

/**
 * Read-only, business-agnostic catalog lookups (Wave 1A foundation for Wave
 * 2's dropdowns) — reads the SAME global `MockStore` catalog maps every
 * mutating repo resolves `categoryId`/`methodId`/`typeId`/`periodTypeId`/
 * `invoiceTypeId` from (see `store.ts#seedCatalogs`), so a list here always
 * matches what a create would have resolved.
 */

function sortedByLabel<T extends { label: string }>(items: Iterable<T>): T[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label));
}

export function createCatalogRepository(store: MockStore): CatalogRepository {
  return {
    async listInvoiceTypes(): Promise<InvoiceType[]> {
      return sortedByLabel(store.invoiceTypes.values());
    },

    async listExpenseCategories(): Promise<CatalogItem[]> {
      return sortedByLabel(store.expenseCategories.values());
    },

    async listPaymentMethods(): Promise<CatalogItem[]> {
      return sortedByLabel(store.paymentMethods.values());
    },

    async listMovementTypes(): Promise<CatalogItem[]> {
      return sortedByLabel(store.movementTypes.values());
    },

    async listPayrollPeriodTypes(): Promise<CatalogItem[]> {
      return sortedByLabel(store.payrollPeriodTypes.values());
    },
  };
}

export const catalogRepo: CatalogRepository = createCatalogRepository(defaultStore);
