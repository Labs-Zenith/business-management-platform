/**
 * Employee service, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Employees Are Business-Scoped and Editable" requirement.
 *
 * Line-for-line analog of `customer-service.ts`: every function resolves
 * `businessId` from the `Session` argument ONLY — never from an id, a client
 * payload, or any other input. Cross-business access always surfaces as
 * `NOT_FOUND`, never leaking whether a differently-scoped record exists.
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type { Employee, EmployeeCreate, EmployeeListQuery, EmployeeUpdate, Paged, Session } from "@/lib/services/ports";

export async function listEmployees(session: Session, query: EmployeeListQuery): Promise<Paged<Employee>> {
  return repositories.employees.list(session.businessId, query);
}

/**
 * Reserved: no route calls this yet — `app/api/employees/[id]/route.ts` only
 * exposes PATCH (see design.md), there is no single-employee GET this phase.
 * Kept for parity with `customer-service.ts`'s `getCustomer` and for a
 * likely future employee-detail view; exercised directly by this file's
 * own tests in the meantime.
 */
export async function getEmployee(session: Session, id: string): Promise<Employee> {
  const employee = await repositories.employees.getById(session.businessId, id);
  if (!employee) {
    throw new ApiError("NOT_FOUND", "Employee not found.");
  }
  return employee;
}

export async function createEmployee(session: Session, data: EmployeeCreate): Promise<Employee> {
  return repositories.employees.create(session.businessId, data);
}

/**
 * Only name/baseSalary/active are ever forwarded to the repository — defense
 * in depth on top of `lib/schemas/employee.ts`'s `.strict()` schema: even if
 * a caller somehow bypasses schema validation, a forged `business_id`/audit
 * field on `data` is stripped here before it ever reaches the repository.
 */
export async function updateEmployee(session: Session, id: string, data: EmployeeUpdate): Promise<Employee> {
  const sanitized: EmployeeUpdate = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.baseSalary !== undefined && { baseSalary: data.baseSalary }),
    ...(data.active !== undefined && { active: data.active }),
  };

  const updated = await repositories.employees.update(session.businessId, id, sanitized);
  if (!updated) {
    throw new ApiError("NOT_FOUND", "Employee not found.");
  }
  return updated;
}
