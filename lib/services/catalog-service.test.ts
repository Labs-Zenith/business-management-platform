import { describe, expect, it } from "vitest";
import { resetStore } from "@/lib/mock/store";
import {
  listExpenseCategories,
  listInvoiceTypes,
  listMovementTypes,
  listPayrollPeriodTypes,
  listPaymentMethods,
} from "./catalog-service";

/**
 * Thin pass-through service — exercises the REAL mock store/repo (mirrors
 * `product-service.test.ts`'s technique), just proving the wiring reaches
 * `repositories.catalog` and returns the expected catalog codes. No
 * `Session`/`businessId` argument on any of these — catalogs are global.
 */

describe("catalog-service", () => {
  it("listInvoiceTypes returns all 3 seeded invoice types", async () => {
    resetStore();

    const types = await listInvoiceTypes();

    expect(types.map((t) => t.code).sort()).toEqual(["nota_credito", "nota_debito", "venta"]);
  });

  it("listExpenseCategories returns both seeded categories", async () => {
    resetStore();

    const categories = await listExpenseCategories();

    expect(categories.map((c) => c.code).sort()).toEqual(["nomina", "otro"]);
  });

  it("listPaymentMethods returns both seeded methods", async () => {
    resetStore();

    const methods = await listPaymentMethods();

    expect(methods.map((m) => m.code).sort()).toEqual(["cash", "transfer"]);
  });

  it("listMovementTypes returns both seeded types", async () => {
    resetStore();

    const types = await listMovementTypes();

    expect(types.map((t) => t.code).sort()).toEqual(["in", "out"]);
  });

  it("listPayrollPeriodTypes returns both seeded types", async () => {
    resetStore();

    const types = await listPayrollPeriodTypes();

    expect(types.map((t) => t.code).sort()).toEqual(["mensual", "quincenal"]);
  });
});
