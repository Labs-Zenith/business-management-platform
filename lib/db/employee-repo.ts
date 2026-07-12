import type { Employee, EmployeeCreate, EmployeeListQuery, EmployeeRepository, EmployeeUpdate, Paged } from "@/lib/services/ports";
import { sql } from "./client";

/**
 * Mirrors `db/customer-repo.ts`'s strategy: fetch business-scoped rows via a
 * simple parameterized query, filter/sort/paginate in JS. No balance/invoice
 * joins here (unlike Customer) — employees have none.
 */

type EmployeeRow = {
  id: string;
  business_id: string;
  name: string;
  base_salary: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    baseSalary: Number(row.base_salary),
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

export const employeeRepo: EmployeeRepository = {
  async list(businessId: string, query: EmployeeListQuery): Promise<Paged<Employee>> {
    const rows = (await sql`SELECT * FROM employees WHERE business_id = ${businessId}`) as unknown as EmployeeRow[];
    let employees = rows.map(toEmployee);

    if (query.status) {
      const wantActive = query.status === "active";
      employees = employees.filter((e) => e.active === wantActive);
    }
    if (query.q) {
      const needle = query.q.trim().toLowerCase();
      employees = employees.filter((e) => e.name.toLowerCase().includes(needle));
    }
    employees.sort((a, b) => a.name.localeCompare(b.name));

    return paginate(employees, query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<Employee | null> {
    const rows = (await sql`SELECT * FROM employees WHERE id = ${id}`) as unknown as EmployeeRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    return toEmployee(row);
  },

  async create(businessId: string, data: EmployeeCreate): Promise<Employee> {
    const rows = (await sql`
      INSERT INTO employees (id, business_id, name, base_salary, active)
      VALUES (gen_random_uuid(), ${businessId}, ${data.name}, ${data.baseSalary}, true)
      RETURNING *
    `) as unknown as EmployeeRow[];
    return toEmployee(rows[0]!);
  },

  async update(businessId: string, id: string, data: EmployeeUpdate): Promise<Employee | null> {
    const existingRows = (await sql`SELECT * FROM employees WHERE id = ${id}`) as unknown as EmployeeRow[];
    const existing = existingRows[0];
    if (!existing || existing.business_id !== businessId) return null;

    const merged = { ...toEmployee(existing), ...data };
    const rows = (await sql`
      UPDATE employees SET
        name = ${merged.name},
        base_salary = ${merged.baseSalary},
        active = ${merged.active},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `) as unknown as EmployeeRow[];
    return toEmployee(rows[0]!);
  },
};
