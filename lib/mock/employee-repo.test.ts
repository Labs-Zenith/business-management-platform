import { beforeEach, describe, expect, it } from "vitest";
import type { EmployeeCreate } from "@/lib/services/ports";
import { createEmployeeRepository } from "./employee-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/customer-repo.test.ts`'s scope (business_id scoping,
 * editable-CRUD), adapted for Employee's simpler shape (no balance/invoice
 * joins). No delete operation exists — only `active` via `update`.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function buildInput(overrides: Partial<EmployeeCreate> = {}): EmployeeCreate {
  return {
    name: "Laura Martinez",
    baseSalary: 2000000,
    ...overrides,
  };
}

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

describe("createEmployeeRepository.create", () => {
  it("persists the employee under businessId with active = true", async () => {
    const repo = createEmployeeRepository(store);

    const employee = await repo.create(BUSINESS_ID, buildInput());

    expect(employee.businessId).toBe(BUSINESS_ID);
    expect(employee.name).toBe("Laura Martinez");
    expect(employee.baseSalary).toBe(2000000);
    expect(employee.active).toBe(true);
    expect(store.employees.get(employee.id)).toEqual(employee);
  });
});

describe("createEmployeeRepository.getById — business_id scoping", () => {
  it("returns the employee when it belongs to the requesting business", async () => {
    const repo = createEmployeeRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(BUSINESS_ID, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("returns null (not a leaked record) for an employee belonging to another business", async () => {
    const repo = createEmployeeRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(OTHER_BUSINESS_ID, created.id);

    expect(found).toBeNull();
  });

  it("returns null for a missing employee id", async () => {
    const repo = createEmployeeRepository(store);

    const found = await repo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(found).toBeNull();
  });
});

describe("createEmployeeRepository.update", () => {
  it("applies name/baseSalary/active updates", async () => {
    const repo = createEmployeeRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const updated = await repo.update(BUSINESS_ID, created.id, {
      name: "Laura M.",
      baseSalary: 2100000,
      active: false,
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Laura M.");
    expect(updated!.baseSalary).toBe(2100000);
    expect(updated!.active).toBe(false);
  });

  it("returns null for cross-business update attempts, leaving the record unchanged", async () => {
    const repo = createEmployeeRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const result = await repo.update(OTHER_BUSINESS_ID, created.id, { name: "Hijacked" });

    expect(result).toBeNull();
    expect(store.employees.get(created.id)!.name).toBe("Laura Martinez");
  });

  it("has no delete operation — only the active toggle exists on the repository interface", async () => {
    const repo = createEmployeeRepository(store);
    expect((repo as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});

describe("createEmployeeRepository.list", () => {
  it("returns only employees scoped to businessId, sorted by name", async () => {
    const repo = createEmployeeRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ name: "Zulema" }));
    await repo.create(BUSINESS_ID, buildInput({ name: "Andres" }));
    await repo.create(OTHER_BUSINESS_ID, buildInput({ name: "De otro negocio" }));

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((e) => e.name)).toEqual(["Andres", "Zulema"]);
  });

  it("filters by status active/inactive", async () => {
    const repo = createEmployeeRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput({ name: "Activo" }));
    await repo.update(BUSINESS_ID, created.id, { active: false });
    await repo.create(BUSINESS_ID, buildInput({ name: "Otro Activo" }));

    const activeResult = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, status: "active" });
    const inactiveResult = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, status: "inactive" });

    expect(activeResult.data.map((e) => e.name)).toEqual(["Otro Activo"]);
    expect(inactiveResult.data.map((e) => e.name)).toEqual(["Activo"]);
  });
});
