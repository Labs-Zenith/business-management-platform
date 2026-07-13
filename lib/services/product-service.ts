/**
 * Product service, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "Products
 * Are Business-Scoped and Editable" requirement.
 *
 * Line-for-line analog of `employee-service.ts`: every function resolves
 * `businessId` from the `Session` argument ONLY — never from an id, a client
 * payload, or any other input. Cross-business access always surfaces as
 * `NOT_FOUND`, never leaking whether a differently-scoped record exists.
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type { Paged, Product, ProductCreate, ProductListQuery, ProductUpdate, ProductWithStock, Session } from "@/lib/services/ports";

export async function listProducts(session: Session, query: ProductListQuery): Promise<Paged<ProductWithStock>> {
  return repositories.products.list(session.businessId, query);
}

export async function getProduct(session: Session, id: string): Promise<ProductWithStock> {
  const product = await repositories.products.getById(session.businessId, id);
  if (!product) {
    throw new ApiError("NOT_FOUND", "Product not found.");
  }
  return product;
}

export async function createProduct(session: Session, data: ProductCreate): Promise<Product> {
  return repositories.products.create(session.businessId, data);
}

/**
 * Only name/sku/unitCost/minStockThreshold/active are ever forwarded to the
 * repository — defense in depth on top of `lib/schemas/product.ts`'s
 * `.strict()` schema: even if a caller somehow bypasses schema validation, a
 * forged `businessId`/computed field on `data` is stripped here before it
 * ever reaches the repository.
 */
export async function updateProduct(session: Session, id: string, data: ProductUpdate): Promise<Product> {
  const sanitized: ProductUpdate = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.sku !== undefined && { sku: data.sku }),
    ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
    ...(data.minStockThreshold !== undefined && { minStockThreshold: data.minStockThreshold }),
    ...(data.active !== undefined && { active: data.active }),
  };

  const updated = await repositories.products.update(session.businessId, id, sanitized);
  if (!updated) {
    throw new ApiError("NOT_FOUND", "Product not found.");
  }
  return updated;
}
