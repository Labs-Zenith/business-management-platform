import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { productCreateSchema } from "@/lib/schemas/product";
import { requireSession } from "@/lib/session";
import { createProduct, listProducts } from "@/lib/services/product-service";
import type { ProductListQuery } from "@/lib/services/ports";

/**
 * `GET`/`POST /api/products`, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "Products
 * Are Business-Scoped and Editable" requirement. Mirrors
 * `app/api/expenses/route.ts`'s exact conventions, EXCEPT there is no
 * `requireCapability` gate here — per the spec's "No Role Gating on
 * Inventory" requirement, any authenticated session (any role) may list or
 * create products, so both handlers use plain `requireSession()`.
 */

function parseStatus(raw: string | null): "active" | "inactive" | undefined {
  if (raw === null) {
    return undefined;
  }
  if (raw === "active" || raw === "inactive") {
    return raw;
  }
  throw new ApiError("VALIDATION_ERROR", 'Invalid "status" query parameter.', { status: raw });
}

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: ProductListQuery = {
    page,
    pageSize,
    q: searchParams.get("q") ?? undefined,
    status: parseStatus(searchParams.get("status")),
  };

  const result = await listProducts(session, query);

  return NextResponse.json(
    { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total },
    { status: 200 },
  );
});

export const POST = withApiHandler(async (request: Request): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: session THEN origin
  // THEN payload shape, before any repository call.
  const session = await requireSession();
  checkOrigin(request);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = productCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid product payload.", parsed.error.flatten());
  }

  const product = await createProduct(session, parsed.data);

  return NextResponse.json({ data: product }, { status: 201 });
});
