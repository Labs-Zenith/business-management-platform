import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { catalogProductUpdateSchema } from "@/lib/schemas/catalog-product";
import { requireCapability, requireSession } from "@/lib/session";
import { isCatalogEnabled } from "@/lib/services/features";
import { deleteCatalogProduct, getCatalogProduct, updateCatalogProduct } from "@/lib/services/product-catalog-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = withApiHandler(async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  if (!(await isCatalogEnabled(session.businessId))) {
    throw new ApiError("FORBIDDEN", "El catálogo no está habilitado para este negocio.");
  }

  const { id } = await context.params;
  const product = await getCatalogProduct(session, id);

  return NextResponse.json({ data: product }, { status: 200 });
});

export const PATCH = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  if (!(await isCatalogEnabled(session.businessId))) {
    throw new ApiError("FORBIDDEN", "El catálogo no está habilitado para este negocio.");
  }
  checkOrigin(request);

  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = catalogProductUpdateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Producto de catálogo inválido.", parsed.error.flatten());
  }

  const product = await updateCatalogProduct(session, id, parsed.data);

  return NextResponse.json({ data: product }, { status: 200 });
});

/**
 * Gated on the admin-only `deleteRecords` capability — same as
 * `app/api/products/[id]/route.ts`'s `DELETE`, and for the same reason:
 * destroying a catalog listing is irreversible in a way the `active` toggle
 * is not. Also GUARDED — a listing that appears on any invoice
 * (`invoice_items.catalog_product_id`) is refused with a `CONFLICT` naming
 * the invoice count, so billing history is never destroyed by a catalog
 * edit (see `deleteCatalogProduct`); the UI turns that refusal into a
 * "Desactivar" offer.
 *
 * `requireCapability` already resolves the session (401 if absent, 403 if
 * the role lacks the capability), so — unlike `GET`/`PATCH` above — this
 * does NOT also call `requireSession`, and does NOT gate on
 * `isCatalogEnabled`: an admin with `deleteRecords` may always clean up a
 * business's own data regardless of whether the catalog module is currently
 * entitled to that business.
 */
export const DELETE = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: capability THEN
  // entitlement THEN origin THEN params, before any repository call. The
  // feature gate is not redundant with the capability: `deleteRecords` says
  // this ADMIN may delete things, while `catalog` says this BUSINESS has the
  // module at all — a business without it must not have its catalog reachable
  // through any verb, exactly as GET and PATCH above already enforce.
  const session = await requireCapability("deleteRecords");
  if (!(await isCatalogEnabled(session.businessId))) {
    throw new ApiError("FORBIDDEN", "El catálogo no está habilitado para este negocio.");
  }
  checkOrigin(request);
  const { id } = await context.params;

  await deleteCatalogProduct(session, id);

  return NextResponse.json({ data: { ok: true } }, { status: 200 });
});
