import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { catalogProductCreateSchema } from "@/lib/schemas/catalog-product";
import { requireSession } from "@/lib/session";
import { isCatalogEnabled } from "@/lib/services/features";
import { createCatalogProduct, listCatalogProducts } from "@/lib/services/product-catalog-service";
import type { CatalogProductListQuery, PricingMode } from "@/lib/services/ports";

/**
 * `GET`/`POST /api/catalog-products` — the commercial catalog (price book).
 * Follows the same defense-in-depth ordering as `app/api/ventas/route.ts`:
 * session THEN per-business feature gate THEN origin THEN payload shape,
 * before any repository access. A session whose business has no enabled
 * `catalog` row gets 403, regardless of role — this module is entitlement
 * gated, not capability gated.
 */

const PRICING_MODES: PricingMode[] = ["fixed", "variant", "package", "tiered", "area"];

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();
  if (!(await isCatalogEnabled(session.businessId))) {
    throw new ApiError("FORBIDDEN", "El catálogo no está habilitado para este negocio.");
  }

  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);

  const pricingMode = url.searchParams.get("pricingMode");
  if (pricingMode !== null && !PRICING_MODES.includes(pricingMode as PricingMode)) {
    throw new ApiError("VALIDATION_ERROR", "Modo de precio inválido.");
  }

  const status = url.searchParams.get("status");
  if (status !== null && status !== "active" && status !== "inactive") {
    throw new ApiError("VALIDATION_ERROR", "Estado inválido.");
  }

  const query: CatalogProductListQuery = {
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    pricingMode: (pricingMode as PricingMode | null) ?? undefined,
    status: status ?? undefined,
    page,
    pageSize,
  };

  const result = await listCatalogProducts(session, query);

  return NextResponse.json(
    { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total },
    { status: 200 },
  );
});

export const POST = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();
  if (!(await isCatalogEnabled(session.businessId))) {
    throw new ApiError("FORBIDDEN", "El catálogo no está habilitado para este negocio.");
  }
  checkOrigin(request);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = catalogProductCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Producto de catálogo inválido.", parsed.error.flatten());
  }

  const product = await createCatalogProduct(session, parsed.data);

  return NextResponse.json({ data: product }, { status: 201 });
});
