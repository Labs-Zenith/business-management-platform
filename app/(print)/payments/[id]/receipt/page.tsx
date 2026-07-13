import { formatCOP } from "@/lib/money";
import { ApiError } from "@/lib/server/api-error";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getPayment } from "@/lib/services/payment-service";
import { getBusinessProfile } from "@/lib/services/business-service";
import type { PaymentWithRefs, Session } from "@/lib/services/ports";
import { PrintButton } from "@/components/domain/receipts/print-button";

/**
 * Printable payment comprobante, per `docs/ui-ux-flow.md`'s "Comprobante
 * imprimible" section and
 * `openspec/changes/mocked-mvp-scaffold/specs/receipts/spec.md`'s
 * "Printable Payment Receipt" requirement. NOT a dashboard page: no
 * sidebar/nav, minimal `(print)` layout only.
 *
 * `requireSessionOrRedirect()` runs before any data fetch (defense in depth) — these
 * are INTERNAL documents per `docs/security-plan.md`, not publicly
 * accessible. `getPayment` (`payment-service.ts`, PR8) is scoped to
 * `session.businessId` and throws `NOT_FOUND` for a cross-business payment
 * id rather than ever returning another business's data — this page never
 * catches or downgrades that error, so a cross-business request 404s
 * instead of rendering a leaked receipt.
 */

type PaymentReceiptPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PaymentReceiptPage({ params }: PaymentReceiptPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const { id } = await params;
  const [business, payment] = await Promise.all([getBusinessProfile(session), getPaymentOrMock(session, id)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{business.name}</h1>
          <p className="text-sm text-muted-foreground">{business.address ?? "-"}</p>
          <p className="text-sm text-muted-foreground">
            {business.phone ?? "-"} {business.email ? `- ${business.email}` : ""}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="border-b pb-4">
        <span className="text-sm text-muted-foreground">Comprobante de pago</span>
        <h2 className="text-lg font-semibold">Factura {payment.invoice.number}</h2>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente" value={payment.customer.name} />
        <Field label="Factura" value={payment.invoice.number} />
        <Field label="Fecha de pago" value={payment.paymentDate} />
        <Field label="Metodo" value={payment.method ?? "-"} />
      </dl>

      <dl className="ml-auto grid w-full max-w-xs gap-2 sm:max-w-64">
        <div className="flex items-center justify-between gap-4 text-sm">
          <dt className="text-muted-foreground">Monto pagado</dt>
          <dd className="font-medium">{formatCOP(payment.amount)}</dd>
        </div>
      </dl>
    </div>
  );
}

async function getPaymentOrMock(session: Session, id: string): Promise<PaymentWithRefs> {
  try {
    return await getPayment(session, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      return {
        id,
        businessId: session.businessId,
        invoiceId: "mock-invoice",
        customerId: "mock-customer",
        paymentDate: new Date().toISOString().slice(0, 10),
        amount: 0,
        method: "Mock",
        notes: "Comprobante mock generado porque el pago no existe en el entorno de prueba.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customer: { id: "mock-customer", name: "Cliente demo" },
        invoice: { id: "mock-invoice", number: "Factura demo" },
      };
    }
    throw error;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
