import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { resetStore, store } from "@/lib/mock/store";
import type { Session } from "@/lib/services/ports";
import { createEmployee, getEmployee, listEmployees, updateEmployee } from "./employee-service";

/**
 * Mirrors `customer-service.test.ts`'s technique: exercises the REAL mock
 * store (not a mocked repository) so business_id scoping is an observable
 * fact, not just an assertion about a thrown error.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: BUSINESS_ID,
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("createEmployee (employee-service)", () => {
  it("ALWAYS derives businessId from the session and creates the employee active", async () => {
    resetStore();

    const employee = await createEmployee(SESSION, { name: "Laura Martinez", baseSalary: 2000000 });

    expect(employee.businessId).toBe(BUSINESS_ID);
    expect(employee.active).toBe(true);
    expect(store.employees.get(employee.id)).toBeDefined();
  });
});

describe("getEmployee (employee-service)", () => {
  it("returns the employee when it belongs to the session's business", async () => {
    resetStore();
    const created = await createEmployee(SESSION, { name: "Consultable", baseSalary: 1500000 });

    const found = await getEmployee(SESSION, created.id);

    expect(found.id).toBe(created.id);
  });

  it("throws NOT_FOUND for a cross-business employee id, never leaking the record", async () => {
    resetStore();
    const created = await createEmployee(SESSION, { name: "De otro negocio", baseSalary: 1500000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(getEmployee(otherSession, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for a missing employee id", async () => {
    resetStore();

    await expect(getEmployee(SESSION, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("listEmployees (employee-service)", () => {
  it("lists only the session business's employees", async () => {
    resetStore();
    await createEmployee(SESSION, { name: "Propio", baseSalary: 1500000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    await createEmployee(otherSession, { name: "Ajeno", baseSalary: 1500000 });

    const result = await listEmployees(SESSION, { page: 1, pageSize: 20 });

    expect(result.data.every((e) => e.businessId === BUSINESS_ID)).toBe(true);
    expect(result.data.some((e) => e.name === "Ajeno")).toBe(false);
  });
});

describe("updateEmployee (employee-service)", () => {
  it("forwards only name/baseSalary/active to the repository, ignoring forged fields", async () => {
    resetStore();
    const created = await createEmployee(SESSION, { name: "Original", baseSalary: 1500000 });
    const forgedData = {
      name: "Actualizado",
      businessId: OTHER_BUSINESS_ID,
    } as unknown as Parameters<typeof updateEmployee>[2];

    const updated = await updateEmployee(SESSION, created.id, forgedData);

    expect(updated.name).toBe("Actualizado");
    expect(updated.businessId).toBe(BUSINESS_ID);
  });

  it("throws NOT_FOUND for a cross-business update attempt", async () => {
    resetStore();
    const created = await createEmployee(SESSION, { name: "Original", baseSalary: 1500000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(updateEmployee(otherSession, created.id, { name: "Hijacked" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("toggles active without touching name/baseSalary when only active is provided", async () => {
    resetStore();
    const created = await createEmployee(SESSION, { name: "Original", baseSalary: 1500000 });

    const updated = await updateEmployee(SESSION, created.id, { active: false });

    expect(updated.active).toBe(false);
    expect(updated.name).toBe("Original");
    expect(updated.baseSalary).toBe(1500000);
  });
});
