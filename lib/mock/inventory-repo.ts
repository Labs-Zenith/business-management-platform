import { ApiError } from "@/lib/server/api-error";
import type {
  InventoryMovement,
  InventoryMovementCreate,
  InventoryMovementListQuery,
  InventoryMovementRepository,
  InventoryMovementWithProduct,
  Paged,
} from "@/lib/services/ports";
import { withLock } from "./lock";
import { generateId, resolveCatalogId, store as defaultStore, type MockStore } from "./store";

function movementsForProduct(store: MockStore, productId: string) {
  return [...store.inventoryMovements.values()].filter((movement) => movement.productId === productId);
}

function currentQuantityFor(store: MockStore, productId: string): number {
  return movementsForProduct(store, productId).reduce(
    (qty, movement) => qty + (movement.type === "in" ? movement.quantity : -movement.quantity),
    0,
  );
}

function toMovementWithProduct(store: MockStore, movement: InventoryMovement): InventoryMovementWithProduct {
  const product = store.products.get(movement.productId);
  return { ...movement, product: { id: movement.productId, name: product?.name ?? "" } };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  return {
    data: items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

/**
 * Artificial async gap simulating a real DB round-trip between reading the
 * current computed quantity and committing the new movement. Without it, a
 * pure synchronous read-check-write could never race in single-threaded JS,
 * which would make `withLock(productId)` untestable and unnecessary here —
 * mirrors `lib/mock/payment-repo.ts`'s identical rationale exactly.
 */
function simulateLatency(ms = 1): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Append-only (list/getById/create only — no update/delete). `create` is the
 * safety-critical floor-at-zero guard: an `out` movement that would drive the
 * product's computed quantity below zero is rejected with ZERO mutation,
 * mirroring `payment-repo.ts`'s overpay guard (`withLock(productId)`
 * read-check-write) — NOT invoice-numbering's blind increment.
 */
export function createInventoryMovementRepository(store: MockStore): InventoryMovementRepository {
  return {
    async list(businessId: string, query: InventoryMovementListQuery): Promise<Paged<InventoryMovementWithProduct>> {
      let movements = [...store.inventoryMovements.values()]
        .filter((movement) => movement.businessId === businessId)
        .map((movement) => toMovementWithProduct(store, movement));

      if (query.productId) {
        movements = movements.filter((movement) => movement.productId === query.productId);
      }
      if (query.type) {
        movements = movements.filter((movement) => movement.type === query.type);
      }
      if (query.from) {
        movements = movements.filter((movement) => movement.createdAt >= query.from!);
      }
      if (query.to) {
        movements = movements.filter((movement) => movement.createdAt <= query.to!);
      }

      movements.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      return paginate(movements, query.page, query.pageSize);
    },

    async getById(businessId: string, id: string): Promise<InventoryMovementWithProduct | null> {
      const movement = store.inventoryMovements.get(id);
      if (!movement || movement.businessId !== businessId) {
        return null;
      }
      return toMovementWithProduct(store, movement);
    },

    async create(businessId: string, data: InventoryMovementCreate): Promise<InventoryMovement> {
      // Atomic, floor-at-zero-safe: read-check-write happens entirely inside
      // one lock holder (`withLock(productId)`), so a concurrent second
      // request can never read a stale pre-insert quantity.
      return withLock(data.productId, async () => {
        const product = store.products.get(data.productId);
        if (!product || product.businessId !== businessId) {
          throw new ApiError("NOT_FOUND", "Product not found");
        }

        const currentQuantity = currentQuantityFor(store, product.id);

        // Real async gap between reading the quantity and committing the
        // movement — this is what makes the lock a genuine correctness
        // requirement rather than a no-op.
        await simulateLatency();

        if (data.type === "out" && data.quantity > currentQuantity) {
          // No mutation, no partial apply: reject before any write.
          throw new ApiError("VALIDATION_ERROR", "Movement would drive stock below zero");
        }

        const now = new Date().toISOString();
        // `typeId` resolved from `type`'s catalog code when the caller
        // doesn't supply one directly (no dropdown UI wires it yet — Wave
        // 2). `type` is always populated (required, enum-checked), so this
        // resolution always succeeds against the seeded catalog. An
        // explicitly-supplied `typeId` is verified to actually exist in the
        // catalog first — defense in depth for any direct caller that
        // bypasses `inventory-service.ts#recordMovement`'s own
        // `assertCatalogId` guard (see `resolveCatalogId`'s doc comment).
        const typeId = resolveCatalogId(store.movementTypes, data.typeId, data.type, "typeId");
        const movement: InventoryMovement = {
          id: generateId(),
          businessId,
          productId: product.id,
          type: data.type,
          typeId,
          quantity: data.quantity,
          note: data.note ?? null,
          createdAt: now,
        };
        store.inventoryMovements.set(movement.id, movement);

        return movement;
      });
    },
  };
}

export const inventoryRepo: InventoryMovementRepository = createInventoryMovementRepository(defaultStore);
