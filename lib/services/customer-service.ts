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

/**
 * Builds the `CONFLICT` message a blocked delete shows the user. Unlike the
 * English `NOT_FOUND` messages above (which no UI ever renders — a 404 is
 * handled structurally), this string IS displayed verbatim in the confirm
 * dialog's inline alert, so it is written in Spanish like the rest of the
 * user-facing copy.
 */
function buildConflictMessage(invoiceCount: number, paymentCount: number): string {
  const parts: string[] = [];
  if (invoiceCount > 0) parts.push(`${invoiceCount} factura${invoiceCount === 1 ? "" : "s"}`);
  if (paymentCount > 0) parts.push(`${paymentCount} pago${paymentCount === 1 ? "" : "s"}`);

  // The adjective agrees with the nouns it follows: "factura" is feminine,
  // "pago" is masculine, and Spanish resolves a mixed list to the masculine
  // plural ("2 facturas y 1 pago asociados").
  const bothKinds = invoiceCount > 0 && paymentCount > 0;
  const total = invoiceCount + paymentCount;
  const adjective = bothKinds
    ? "asociados"
    : invoiceCount > 0
      ? `asociada${total === 1 ? "" : "s"}`
      : `asociado${total === 1 ? "" : "s"}`;

  return `No se puede eliminar este cliente porque tiene ${parts.join(" y ")} ${adjective}. Desactívalo en su lugar.`;
}

/**
 * Hard delete, refused while anything financial references the customer —
 * unlike `deleteProduct`, which always succeeds. See `CustomerDeleteResult`
 * in `ports.ts` for the reasoning. Admin-only: the `deleteRecords` capability
 * is enforced at the route.
 */
export async function deleteCustomer(session: Session, id: string): Promise<void> {
  const result = await repositories.customers.delete(session.businessId, id);

  if (result.outcome === "not_found") {
    throw new ApiError("NOT_FOUND", "Customer not found.");
  }
  if (result.outcome === "conflict") {
    throw new ApiError("CONFLICT", buildConflictMessage(result.invoiceCount, result.paymentCount), {
      invoiceCount: result.invoiceCount,
      paymentCount: result.paymentCount,
    });
  }
}
