/**
 * Inventory movement service, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s
 * "Inventory Movements Are Business-Scoped and Append-Only", "Positive
 * Integer Movement Quantity", and "Floor-at-Zero Atomic Guard on Out
 * Movements" requirements.
 *
 * SAFETY-CRITICAL: `recordMovement` is a thin, honest wrapper around
 * `repositories.inventory.create` (`lib/mock/inventory-repo.ts` /
 * `lib/db/inventory-repo.ts`), which already performs the whole atomic
 * floor-at-zero guard: it scopes the product lookup to `businessId`
 * (cross-business or missing -> `NOT_FOUND`), recalculates the current
 * computed quantity, and rejects an `out` movement that would drive it below
 * zero with NO mutation at all — this service does NOT re-derive that guard,
 * mirroring `payment-service.ts`'s honesty about `createForInvoice`.
 *
 * The one thing validated HERE (not just by
 * `lib/schemas/inventory-movement.ts`'s `.strict()` schema at the route
 * layer) is that `quantity` is a positive integer — defense in depth so a
 * caller that somehow bypasses schema validation still cannot reach the
 * repository with an invalid quantity.
 *
 * `typeId` (optional FK to `movement_types.id`) is ALSO validated to
 * actually EXIST in the catalog — via `assertCatalogId` — before `data` is
 * ever forwarded to `repositories.inventory.create`, so a well-formed but
 * nonexistent id fails here with a clean `VALIDATION_ERROR` instead of
 * reaching the mock (silent dangling FK) or the DB backend (raw
 * FK-violation 500). When omitted, the repository still resolves it from
 * `type`'s code, exactly as before.
 */

import { ApiError } from "@/lib/server/api-error";
import { assertCatalogId } from "@/lib/services/catalog-service";
import { repositories } from "@/lib/services/repositories";
import type { InventoryMovement, InventoryMovementCreate, InventoryMovementListQuery, InventoryMovementWithProduct, Paged, Session } from "@/lib/services/ports";

export async function listMovements(session: Session, query: InventoryMovementListQuery): Promise<Paged<InventoryMovementWithProduct>> {
  return repositories.inventory.list(session.businessId, query);
}

export async function recordMovement(session: Session, data: InventoryMovementCreate): Promise<InventoryMovement> {
  if (!Number.isInteger(data.quantity) || data.quantity <= 0) {
    throw new ApiError("VALIDATION_ERROR", "Movement quantity must be a positive integer.");
  }

  if (data.typeId) {
    const types = await repositories.catalog.listMovementTypes();
    assertCatalogId(types, data.typeId, "typeId");
  }

  // Atomic, floor-at-zero-safe, businessId-scoped registration happens
  // entirely inside the repository (PR1's `lib/mock/inventory-repo.ts` /
  // `lib/db/inventory-repo.ts`) — this service only ever hands it
  // `session.businessId` and the validated payload.
  return repositories.inventory.create(session.businessId, data);
}
