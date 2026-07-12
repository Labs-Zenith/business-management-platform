import type { Employee, EmployeeCreate, EmployeeListQuery, EmployeeRepository, EmployeeUpdate, Paged } from "@/lib/services/ports";
import { generateId, store as defaultStore, type MockStore } from "./store";

/**
 * Mirrors `customer-repo.ts`'s structure closely — employees are editable
 * (list/getById/create/update), business-scoped, no delete (only the
 * `active` toggle via `update`). No balance/invoice/payment joins here.
 */

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

export function createEmployeeRepository(store: MockStore): EmployeeRepository {
  return {
    async list(businessId: string, query: EmployeeListQuery): Promise<Paged<Employee>> {
      let employees = [...store.employees.values()].filter((employee) => employee.businessId === businessId);

      if (query.status) {
        const wantActive = query.status === "active";
        employees = employees.filter((employee) => employee.active === wantActive);
      }
      if (query.q) {
        const needle = query.q.trim().toLowerCase();
        employees = employees.filter((employee) => employee.name.toLowerCase().includes(needle));
      }

      employees.sort((a, b) => a.name.localeCompare(b.name));

      return paginate(employees, query.page, query.pageSize);
    },

    async getById(businessId: string, id: string): Promise<Employee | null> {
      const employee = store.employees.get(id);
      if (!employee || employee.businessId !== businessId) {
        return null;
      }
      return employee;
    },

    async create(businessId: string, data: EmployeeCreate): Promise<Employee> {
      const now = new Date().toISOString();
      const employee: Employee = {
        id: generateId(),
        businessId,
        name: data.name,
        baseSalary: data.baseSalary,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      store.employees.set(employee.id, employee);
      return employee;
    },

    async update(businessId: string, id: string, data: EmployeeUpdate): Promise<Employee | null> {
      const existing = store.employees.get(id);
      if (!existing || existing.businessId !== businessId) {
        return null;
      }

      const updated: Employee = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      store.employees.set(id, updated);
      return updated;
    },
  };
}

export const employeeRepo: EmployeeRepository = createEmployeeRepository(defaultStore);
