import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { catalogProductUpdateSchema } from "@/lib/schemas/catalog-product";
import { requireSession } from "@/lib/session";
import { isCatalogEnabled } from "@/lib/services/features";
import { getCatalogProduct, updateCatalogProduct } from "@/lib/services/product-catalog-service";

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
