import { ApiError } from "@/lib/server/api-error";
import type { InvoiceDetail, Paged, PaymentInput, PaymentListQuery, PaymentRepository, PaymentWithRefs } from "@/lib/services/ports";
import { runTransaction, sql } from "./client";
import { invoiceRepo } from "./invoice-repo";

/**
 * `createForInvoice`'s overpay guard, which must serialize with
 * `invoice-repo.ts#update`'s edit-lock on the SAME `invoices` row — the shared
 * TWO-STATEMENT `FOR UPDATE` pattern (see `client.ts`'s `runTransaction`
 * canonical note for the mechanism and why a single inline-`FOR UPDATE` CTE is
 * insufficient).
 *
 * FILE-SPECIFIC details:
 *   - Statement 1 locks the `invoices` row; statement 2 is the existing
 *     balance-CTE `INSERT … RETURNING id`. This writer only inserts into the
 *     sibling `payments` table — it never modifies the locked `invoices` row —
 *     which is precisely why a single-statement `FOR UPDATE` here leaves a
 *     concurrent edit's `NOT EXISTS(payments)` stale (nothing for EvalPlanQual
 *     to reconcile on the unchanged invoices tuple). BOTH writers therefore
 *     need the two-statement split.
 *   - Empirical run count (real Postgres 16 container, two concurrent `pg`
 *     connections, hold-open-then-release): baseline no-lock BROKEN 6/6;
 *     single-statement `FOR UPDATE` here only BROKEN 3/3 (payment-first);
 *     two-statement fix on BOTH writers CORRECT 10/10 (5 payment-first + 5
 *     edit-first incl. the downward-edit regression). See
 *     `openspec/changes/audit-log/design.md`'s "Open Questions".
 */

type PaymentRow = {
  id: string;
  business_id: string;
  invoice_id: string;
  customer_id: string;
  payment_date: string;
  amount: number;
  method: string | null;
  method_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function toPaymentWithRefs(row: PaymentRow): Promise<PaymentWithRefs> {
  const [customerRows, invoiceRows] = (await Promise.all([
    sql`SELECT id, name FROM customers WHERE id = ${row.customer_id}`,
    sql`SELECT id, number FROM invoices WHERE id = ${row.invoice_id}`,
  ])) as unknown as [{ id: string; name: string }[], { id: string; number: string }[]];
  return {
    id: row.id,
    businessId: row.business_id,
    invoiceId: row.invoice_id,
    customerId: row.customer_id,
    paymentDate: toDateStr(row.payment_date),
    amount: Number(row.amount),
    method: row.method,
    methodId: row.method_id,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    customer: { id: row.customer_id, name: customerRows[0]?.name ?? "" },
    invoice: { id: row.invoice_id, number: invoiceRows[0]?.number ?? "" },
  };
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

export const paymentRepo: PaymentRepository = {
  async getById(businessId: string, id: string): Promise<PaymentWithRefs | null> {
    const rows = (await sql`SELECT * FROM payments WHERE id = ${id}`) as unknown as PaymentRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    return toPaymentWithRefs(row);
  },

  async list(businessId: string, query: PaymentListQuery): Promise<Paged<PaymentWithRefs>> {
    const rows = (await sql`SELECT * FROM payments WHERE business_id = ${businessId}`) as unknown as PaymentRow[];
    let withRefs = await Promise.all(rows.map(toPaymentWithRefs));

    if (query.customerId) withRefs = withRefs.filter((p) => p.customerId === query.customerId);
    if (query.invoiceId) withRefs = withRefs.filter((p) => p.invoiceId === query.invoiceId);
    if (query.from) withRefs = withRefs.filter((p) => p.paymentDate >= query.from!);
    if (query.to) withRefs = withRefs.filter((p) => p.paymentDate <= query.to!);

    withRefs.sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
    return paginate(withRefs, query.page, query.pageSize) as Paged<PaymentWithRefs>;
  },

  async createForInvoice(businessId: string, invoiceId: string, data: PaymentInput): Promise<InvoiceDetail> {
    // Two statements, ONE real transaction (see `client.ts`'s canonical note
    // and this file's doc comment). Shares the invoice row lock with
    // `invoice-repo.ts#update`'s edit guard. Sequential awaits inside the
    // `runTransaction` callback preserve the exact statement order.
    const { lockRows, inserted } = await runTransaction(async (tx) => {
      // Statement 1: acquire and HOLD the invoice row lock for the whole
      // transaction. Its result is used ONLY to distinguish NOT_FOUND
      // (missing/cross-business) from the overpay rejection below.
      const lockRows = (await tx`
        SELECT id, customer_id FROM invoices WHERE id = ${invoiceId} AND business_id = ${businessId} FOR UPDATE
      `) as unknown as { id: string; customer_id: string }[];

      // Statement 2: fresh-snapshot balance guard + conditional insert. Runs
      // AFTER statement 1 already holds the lock, so a concurrent edit's own
      // lock-acquisition (invoice-repo.ts#update's statement 1) blocks until
      // this transaction commits — by which time its own statement 2 takes a
      // snapshot that already reflects this transaction's committed payment.
      // No `FOR UPDATE` needed here: statement 1 is the sole lock holder;
      // re-locking would only invite the EvalPlanQual stale-subquery hazard
      // the two-statement split avoids (see the doc comment above).
      // `method_id` is resolved in the SAME statement (no extra round trip):
      // the caller-supplied `data.methodId` wins when present, otherwise it's
      // looked up from `payment_methods` by `method`'s code. When `method`
      // itself is absent, both the explicit id and the subquery are `null`,
      // so `method_id` ends up `null` too — mirroring `method`'s own
      // nullability (see `PaymentInput.methodId`'s doc comment for why this
      // column is deliberately NOT enforced NOT NULL).
      const inserted = (await tx`
        WITH bal AS (
          SELECT i.id, i.customer_id,
            i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS balance
          FROM invoices i
          WHERE i.id = ${invoiceId} AND i.business_id = ${businessId}
        )
        INSERT INTO payments (id, business_id, invoice_id, customer_id, payment_date, amount, method, method_id, notes)
        SELECT gen_random_uuid(), ${businessId}, bal.id, bal.customer_id, ${data.paymentDate}, ${data.amount}, ${data.method ?? null},
          COALESCE(${data.methodId ?? null}::uuid, (SELECT id FROM payment_methods WHERE code = ${data.method ?? null})),
          ${data.notes ?? null}
        FROM bal
        WHERE ${data.amount} <= bal.balance
        RETURNING id
      `) as unknown as { id: string }[];

      return { lockRows, inserted };
    });

    if (lockRows.length === 0) {
      throw new ApiError("NOT_FOUND", "Invoice not found");
    }
    if (inserted.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "Payment amount exceeds the invoice's pending balance");
    }

    const detail = await invoiceRepo.getById(businessId, invoiceId);
    if (!detail) {
      throw new ApiError("NOT_FOUND", "Invoice not found");
    }
    return detail;
  },
};
