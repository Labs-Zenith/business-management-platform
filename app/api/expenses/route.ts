import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { expenseCreateSchema } from "@/lib/schemas/expense";
import { requireSession } from "@/lib/session";
import { createExpense, listExpenses } from "@/lib/services/expense-service";
import type { ExpenseCategory, ExpenseListQuery } from "@/lib/services/ports";

/**
 * `GET`/`POST /api/expenses`, per
 * `openspec/changes/expenses-dashboard-split/specs/expense-tracking/spec.md`
 * and `openspec/changes/expenses-dashboard-split/design.md` section 5.
 * Mirrors `app/api/invoices/route.ts` exactly.
 */

const VALID_CATEGORIES: ExpenseCategory[] = ["nomina", "otro"];

function parseCategory(raw: string | null): ExpenseCategory | undefined {
  if (raw === null) {
    return undefined;
  }
  if ((VALID_CATEGORIES as string[]).includes(raw)) {
    return raw as ExpenseCategory;
  }
  throw new ApiError("VALIDATION_ERROR", 'Invalid "category" query parameter.', { category: raw });
}

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: ExpenseListQuery = {
    page,
    pageSize,
    category: parseCategory(searchParams.get("category")),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const result = await listExpenses(session, query);

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

  const parsed = expenseCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid expense payload.", parsed.error.flatten());
  }

  const expense = await createExpense(session, parsed.data);

  return NextResponse.json({ data: expense }, { status: 201 });
});
