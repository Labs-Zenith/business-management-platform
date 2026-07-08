import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { invoiceCreateSchema } from "@/lib/schemas/invoice";
import { requireSession } from "@/lib/session";
import { createInvoice, listInvoices } from "@/lib/services/invoice-service";
import type { InvoiceListQuery } from "@/lib/services/ports";
import type { InvoiceStatus } from "@/lib/services/status";

/**
 * `GET`/`POST /api/invoices`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/invoices/spec.md` and
 * `docs/api-spec.md`'s Invoices section.
 */

const VALID_STATUSES: InvoiceStatus[] = ["pending", "partially_paid", "paid", "overdue"];

function parseStatus(raw: string | null): InvoiceStatus | undefined {
  if (raw === null) {
    return undefined;
  }
  if ((VALID_STATUSES as string[]).includes(raw)) {
    return raw as InvoiceStatus;
  }
  throw new ApiError("VALIDATION_ERROR", 'Invalid "status" query parameter.', { status: raw });
}

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: InvoiceListQuery = {
    page,
    pageSize,
    customerId: searchParams.get("customerId") ?? undefined,
    status: parseStatus(searchParams.get("status")),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const result = await listInvoices(session, query);

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

  const parsed = invoiceCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid invoice payload.", parsed.error.flatten());
  }

  const invoice = await createInvoice(session, parsed.data);

  return NextResponse.json({ data: invoice }, { status: 201 });
});
