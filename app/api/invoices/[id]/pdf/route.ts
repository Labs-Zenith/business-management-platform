import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { getBusinessProfile } from "@/lib/services/business-service";
import { getInvoice } from "@/lib/services/invoice-service";
import { renderInvoicePdf } from "@/lib/export/pdf";
import { binaryAttachmentWithFilename } from "@/lib/export/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function filenameSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export const GET = withApiHandler(async (_request: Request, context: RouteContext) => {
  const session = await requireSession();
  const { id } = await context.params;
  const [business, invoice] = await Promise.all([getBusinessProfile(session), getInvoice(session, id)]);
  const pdf = await renderInvoicePdf(business, invoice);

  return binaryAttachmentWithFilename(pdf, "application/pdf", `factura-${filenameSafe(invoice.number)}.pdf`);
});
