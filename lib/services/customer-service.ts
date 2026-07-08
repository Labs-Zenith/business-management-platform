/**
 * Customer service, per
 * `openspec/changes/mocked-mvp-scaffold/specs/customers/spec.md`.
 *
 * Every function resolves `businessId` from the `Session` argument ONLY —
 * never from an id, a client payload, or any other input — matching the
 * "business_id Scoping (RLS-Equivalent)" requirement. Cross-business access
 * always surfaces as `NOT_FOUND`, never leaking whether a differently-scoped
 * record exists.
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type {
  Customer,
  CustomerCreate,
  CustomerDetail,
  CustomerListQuery,
  CustomerUpdate,
  CustomerWithBalance,
  Paged,
  Session,
} from "@/lib/services/ports";

export async function listCustomers(
  session: Session,
  query: CustomerListQuery,
): Promise<Paged<CustomerWithBalance>> {
  return repositories.customers.list(session.businessId, query);
}

export async function getCustomer(session: Session, id: string): Promise<CustomerDetail> {
  const customer = await repositories.customers.getById(session.businessId, id);
  if (!customer) {
    throw new ApiError("NOT_FOUND", "Customer not found.");
  }
  return customer;
}

export async function createCustomer(session: Session, data: CustomerCreate): Promise<Customer> {
  return repositories.customers.create(session.businessId, data);
}

/**
 * Only descriptive fields + `isActive` are ever forwarded to the repository
 * — this is defense in depth on top of `lib/schemas/customer.ts`'s
 * `.strict()` schema: even if a caller somehow bypasses schema validation
 * (or a future caller forgets to validate), a forged `business_id`/balance/
 * audit field on `data` is stripped here before it ever reaches the mock
 * store.
 */
export async function updateCustomer(session: Session, id: string, data: CustomerUpdate): Promise<Customer> {
  const sanitized: CustomerUpdate = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.documentNumber !== undefined && { documentNumber: data.documentNumber }),
    ...(data.email !== undefined && { email: data.email }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.address !== undefined && { address: data.address }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
  };

  const updated = await repositories.customers.update(session.businessId, id, sanitized);
  if (!updated) {
    throw new ApiError("NOT_FOUND", "Customer not found.");
  }
  return updated;
}
