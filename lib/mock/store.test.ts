import { describe, expect, it } from "vitest";
import type { Business } from "@/lib/services/ports";
import {
  createEmptyStore,
  findCatalogIdByCode,
  hydrateStore,
  serializeStore,
  type Profile,
  type SerializedStore,
} from "./store";

/**
 * Regression test for design Risk R4: a cookie serialized BEFORE the
 * `expenses` field existed has no `expenses` key at all on the parsed JSON
 * object. `hydrateStore` MUST NOT throw on that payload — the `?? []`
 * fallback in `hydrateStore` is what makes this safe.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const PROFILE_ID = "30000000-0000-4000-8000-000000000001";

function buildLegacyPayload(): Omit<
  SerializedStore,
  "expenses" | "employees" | "payrollPayments" | "products" | "inventoryMovements" | "auditLogs"
> {
  const business: Business = {
    id: BUSINESS_ID,
    name: "Negocio Legacy",
    email: null,
    phone: null,
    address: null,
    currency: "COP",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  const profile: Profile = {
    id: PROFILE_ID,
    userId: "20000000-0000-4000-8000-000000000001",
    businessId: BUSINESS_ID,
    fullName: "Usuario Legacy",
    email: "legacy@negociodemo.test",
    role: "admin",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  return {
    businesses: [business],
    profiles: [profile],
    customers: [],
    invoices: [],
    invoiceItems: [],
    payments: [],
    invoiceSequences: {},
  };
}

describe("hydrateStore — backward compatibility with pre-expenses cookies (R4)", () => {
  it("does not throw when the payload is missing the expenses field entirely", () => {
    const legacyPayload = buildLegacyPayload() as SerializedStore; // simulates JSON.parse of an old cookie: no `expenses` key
    const target = createEmptyStore();

    expect(() => hydrateStore(legacyPayload, target)).not.toThrow();
  });

  it("hydrates the rest of the store correctly even though expenses is absent, leaving expenses empty", () => {
    const legacyPayload = buildLegacyPayload() as SerializedStore;
    const target = createEmptyStore();

    hydrateStore(legacyPayload, target);

    expect(target.businesses.get(BUSINESS_ID)).toBeDefined();
    expect(target.profiles.get(PROFILE_ID)).toBeDefined();
    expect(target.expenses.size).toBe(0);
  });

  it("does not throw when the payload is missing the employees/payrollPayments fields entirely (nomina-payroll regression)", () => {
    const legacyPayload = buildLegacyPayload() as SerializedStore; // simulates JSON.parse of a cookie predating employees/payrollPayments
    const target = createEmptyStore();

    expect(() => hydrateStore(legacyPayload, target)).not.toThrow();
    expect(target.employees.size).toBe(0);
    expect(target.payrollPayments.size).toBe(0);
  });

  it("still hydrates employees/payrollPayments normally when both fields ARE present (current-format cookie)", () => {
    const target = createEmptyStore();
    target.employees.set("70000000-0000-4000-8000-000000000001", {
      id: "70000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      name: "Laura Martinez",
      baseSalary: 2000000,
      active: true,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    target.payrollPayments.set("80000000-0000-4000-8000-000000000001", {
      id: "80000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      employeeId: "70000000-0000-4000-8000-000000000001",
      amount: 1000000,
      periodType: "quincenal",
      periodTypeId: findCatalogIdByCode(target.payrollPeriodTypes, "quincenal")!,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-15",
      paymentDate: "2026-07-16",
      notes: null,
      createdAt: "2026-07-16T00:00:00.000Z",
    });
    const snapshot = serializeStore(target);

    const rehydrated = createEmptyStore();
    hydrateStore(snapshot, rehydrated);

    expect(rehydrated.employees.size).toBe(1);
    expect(rehydrated.payrollPayments.size).toBe(1);
    expect(rehydrated.employees.get("70000000-0000-4000-8000-000000000001")?.name).toBe("Laura Martinez");
  });

  it("still hydrates expenses normally when the field IS present (current-format cookie)", () => {
    const target = createEmptyStore();
    target.expenses.set("60000000-0000-4000-8000-000000000001", {
      id: "60000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      category: "otro",
      categoryId: findCatalogIdByCode(target.expenseCategories, "otro")!,
      expenseDate: "2026-07-01",
      description: "Gasto de prueba",
      amount: 10000,
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const snapshot = serializeStore(target);

    const rehydrated = createEmptyStore();
    hydrateStore(snapshot, rehydrated);

    expect(rehydrated.expenses.size).toBe(1);
    expect(rehydrated.expenses.get("60000000-0000-4000-8000-000000000001")?.description).toBe("Gasto de prueba");
  });

  it("does not throw when the payload is missing the products/inventoryMovements fields entirely (inventario regression)", () => {
    const legacyPayload = buildLegacyPayload() as SerializedStore; // simulates JSON.parse of a cookie predating products/inventoryMovements
    const target = createEmptyStore();

    expect(() => hydrateStore(legacyPayload, target)).not.toThrow();
    expect(target.products.size).toBe(0);
    expect(target.inventoryMovements.size).toBe(0);
  });

  it("does not throw when the payload is missing the auditLogs field entirely (audit-log regression)", () => {
    const legacyPayload = buildLegacyPayload() as SerializedStore; // simulates JSON.parse of a cookie predating audit-log
    const target = createEmptyStore();

    expect(() => hydrateStore(legacyPayload, target)).not.toThrow();
    expect(target.auditLogs.size).toBe(0);
  });

  it("still hydrates auditLogs normally when the field IS present (current-format cookie)", () => {
    const target = createEmptyStore();
    target.auditLogs.set("b0000000-0000-4000-8000-000000000001", {
      id: "b0000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      entityType: "invoice",
      entityId: "50000000-0000-4000-8000-000000000001",
      action: "invoice_created",
      actorUserId: "20000000-0000-4000-8000-000000000001",
      detail: "FAC-0001",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const snapshot = serializeStore(target);

    const rehydrated = createEmptyStore();
    hydrateStore(snapshot, rehydrated);

    expect(rehydrated.auditLogs.size).toBe(1);
    expect(rehydrated.auditLogs.get("b0000000-0000-4000-8000-000000000001")?.action).toBe("invoice_created");
  });

  it("still hydrates products/inventoryMovements normally when both fields ARE present (current-format cookie)", () => {
    const target = createEmptyStore();
    target.products.set("90000000-0000-4000-8000-000000000001", {
      id: "90000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      name: "Shampoo Profesional",
      sku: "SHP-001",
      unitCost: 25000,
      active: true,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    target.inventoryMovements.set("a0000000-0000-4000-8000-000000000001", {
      id: "a0000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      productId: "90000000-0000-4000-8000-000000000001",
      type: "in",
      typeId: findCatalogIdByCode(target.movementTypes, "in")!,
      quantity: 10,
      note: null,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const snapshot = serializeStore(target);

    const rehydrated = createEmptyStore();
    hydrateStore(snapshot, rehydrated);

    expect(rehydrated.products.size).toBe(1);
    expect(rehydrated.inventoryMovements.size).toBe(1);
    expect(rehydrated.products.get("90000000-0000-4000-8000-000000000001")?.name).toBe("Shampoo Profesional");
  });
});
