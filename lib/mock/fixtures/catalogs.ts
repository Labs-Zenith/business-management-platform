/**
 * Global, business-agnostic catalog fixtures (Wave 1A) — mirrors the seed
 * `INSERT ... ON CONFLICT (code) DO NOTHING` statements in
 * `migrations/1700000010000_catalogs.sql` EXACTLY (same codes/labels/prefix),
 * so the mock backend and the real Postgres backend never disagree about
 * what a catalog code resolves to.
 *
 * These are NOT per-business/session data — every `MockStore` (including
 * ones created via `createEmptyStore()` in ~15 existing repo test files that
 * never call `seedFixtures`/`seedMinimal`) needs these populated immediately,
 * since `expense-repo.ts#create` etc. resolve `categoryId`/`methodId`/
 * `typeId`/`periodTypeId` from them at write time. See `store.ts#
 * createEmptyStore`'s call to `seedCatalogs` for why this is seeded
 * unconditionally, not just in the full demo fixture set.
 *
 * DEVIATION NOTE: `venta`'s prefix is `FAC` (not the originally-proposed
 * `FV`) — see the catalogs migration's own deviation note for why (numbering
 * continuity with ~20 existing test files and any real historical data).
 */

export type CatalogFixture = {
  id: string;
  code: string;
  label: string;
  active: boolean;
};

export type InvoiceTypeFixture = CatalogFixture & { prefix: string };

function catalogId(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const invoiceTypeFixtures: InvoiceTypeFixture[] = [
  { id: catalogId("c1000000", 1), code: "venta", label: "Factura de venta", prefix: "FAC", active: true },
  { id: catalogId("c1000000", 2), code: "nota_credito", label: "Nota crédito", prefix: "NC", active: true },
  { id: catalogId("c1000000", 3), code: "nota_debito", label: "Nota débito", prefix: "ND", active: true },
];

export const expenseCategoryFixtures: CatalogFixture[] = [
  { id: catalogId("c2000000", 1), code: "nomina", label: "Nómina", active: true },
  { id: catalogId("c2000000", 2), code: "otro", label: "Otro", active: true },
];

export const paymentMethodFixtures: CatalogFixture[] = [
  { id: catalogId("c3000000", 1), code: "cash", label: "Efectivo", active: true },
  { id: catalogId("c3000000", 2), code: "transfer", label: "Transferencia", active: true },
];

export const movementTypeFixtures: CatalogFixture[] = [
  { id: catalogId("c4000000", 1), code: "in", label: "Entrada", active: true },
  { id: catalogId("c4000000", 2), code: "out", label: "Salida", active: true },
];

export const payrollPeriodTypeFixtures: CatalogFixture[] = [
  { id: catalogId("c5000000", 1), code: "quincenal", label: "Quincenal", active: true },
  { id: catalogId("c5000000", 2), code: "mensual", label: "Mensual", active: true },
];
