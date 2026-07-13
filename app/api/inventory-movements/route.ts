import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { inventoryMovementCreateSchema } from "@/lib/schemas/inventory-movement";
import { requireSession } from "@/lib/session";
import { listMovements, recordMovement } from "@/lib/services/inventory-service";
import type { InventoryMovementListQuery, MovementType } from "@/lib/services/ports";

/**
 * `GET`/`POST /api/inventory-movements`, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "Inventory
 * Movements Are Business-Scoped and Append-Only", "Positive Integer Movement
 * Quantity", and "Floor-at-Zero Atomic Guard on Out Movements" requirements.
 * There is no `PATCH`/`DELETE` here — movements are append-only, so only
 * list + create exist.
 *
 * Mirrors `app/api/payroll-payments/route.ts`'s shape, EXCEPT there is no
 * `requireCapability` gate — per the spec's "No Role Gating on Inventory"
 * requirement, plain `requireSession()` is used on both handlers. `POST`
 * delegates to `recordMovement`, which surfaces the repository's
 * floor-at-zero rejection as `VALIDATION_ERROR` and a missing/cross-business
 * product as `NOT_FOUND`, both handled generically by `withApiHandler`.
 */

const VALID_TYPES: MovementType[] = ["in", "out"];

function parseType(raw: string | null): MovementType | undefined {
  if (raw === null) {
    return undefined;
  }
  if ((VALID_TYPES as string[]).includes(raw)) {
    return raw as MovementType;
  }
  throw new ApiError("VALIDATION_ERROR", 'Invalid "type" query parameter.', { type: raw });
}

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: InventoryMovementListQuery = {
    page,
    pageSize,
    productId: searchParams.get("productId") ?? undefined,
    type: parseType(searchParams.get("type")),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const result = await listMovements(session, query);

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

  const parsed = inventoryMovementCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid inventory movement payload.", parsed.error.flatten());
  }

  const movement = await recordMovement(session, parsed.data);

  return NextResponse.json({ data: movement }, { status: 201 });
});
