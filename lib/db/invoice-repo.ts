import { ApiError } from "@/lib/server/api-error";
import type {
  Customer,
  Invoice,
  InvoiceDetail,
  InvoiceItem,
  InvoiceListQuery,
  InvoicePersist,
  InvoiceRepository,
  InvoiceWithFinance,
  Paged,
  PaymentWithRefs,
} from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { runTransaction, sql } from "./client";

type InvoiceRow = {
  id: string;
  business_id: string;
  customer_id: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  total: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: string;
  unit_price: number;
  line_total: number;
};

type PaymentRow = {
  id: string;
  business_id: string;
  invoice_id: string;
  customer_id: string;
  payment_date: string;
  amount: number;
  method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerRow = {
  id: string;
  name: string;
  business_id: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function toDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    documentNumber: row.document_number,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
  };
}

function toPaymentWithRefs(payment: PaymentRow, customerName: string, invoiceNumber: string): PaymentWithRefs {
  return {
    id: payment.id,
    businessId: payment.business_id,
    invoiceId: payment.invoice_id,
    customerId: payment.customer_id,
    paymentDate: toDateStr(payment.payment_date),
    amount: Number(payment.amount),
    method: payment.method,
    notes: payment.notes,
    createdAt: new Date(payment.created_at).toISOString(),
    updatedAt: new Date(payment.updated_at).toISOString(),
    customer: { id: payment.customer_id, name: customerName },
    invoice: { id: payment.invoice_id, number: invoiceNumber },
  };
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    number: row.number,
    issueDate: toDateStr(row.issue_date),
    dueDate: row.due_date ? toDateStr(row.due_date) : null,
    subtotal: Number(row.subtotal),
    total: Number(row.total),
    status: row.status as Invoice["status"],
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function withFinance(invoice: Invoice, payments: PaymentRow[]): InvoiceWithFinance {
  const paidAmount = payments
    .filter((p) => String(p.invoice_id) === String(invoice.id))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = invoice.total - paidAmount;
  const status = computeStatus(invoice.total, paidAmount, invoice.dueDate, new Date());
  return { ...invoice, paidAmount, balance, status };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

async function buildDetail(invoice: Invoice): Promise<InvoiceDetail> {
  const [customerRows, itemRows, paymentRows] = (await Promise.all([
    sql`SELECT * FROM customers WHERE id = ${invoice.customerId}`,
    sql`SELECT * FROM invoice_items WHERE invoice_id = ${invoice.id}`,
    sql`SELECT * FROM payments WHERE invoice_id = ${invoice.id}`,
  ])) as unknown as [CustomerRow[], InvoiceItemRow[], PaymentRow[]];
  const customer = toCustomer(customerRows[0]);
  const withFinanceData = withFinance(invoice, paymentRows);
  const payments = paymentRows.map((p) => toPaymentWithRefs(p, customer.name, invoice.number));
  return { ...withFinanceData, customer, items: itemRows.map(toItem), payments };
}

/**
 * `update`'s edit-lock guard, which must serialize with
 * `payment-repo.ts#createForInvoice`'s overpay guard on the SAME `invoices`
 * row — the shared TWO-STATEMENT `FOR UPDATE` pattern (see `client.ts`'s
 * `runTransaction` canonical note for the mechanism and why a single
 * inline-`FOR UPDATE` statement is insufficient).
 *
 * FILE-SPECIFIC details:
 *   - Statement 1 locks the `invoices` row (empty result -> `null` NOT_FOUND).
 *     Statements 2..N-1 replace the line items (a guarded DELETE + one
 *     guarded `INSERT ... SELECT ... WHERE EXISTS(...)` per item). Statement
 *     N — the LAST statement — is the FRESH "not fully paid AND new total not
 *     below what's already paid" guarded header UPDATE. ALL of this runs
 *     inside the SAME `sql.transaction([...])`, so an edit's header and its
 *     items are replaced atomically. Because the transaction is
 *     non-interactive (every statement runs regardless of the others'
 *     results), EACH item statement carries the SAME compound guard the
 *     header UPDATE uses — so an edit against a fully-paid invoice, an edit
 *     whose new total would drop below the amount already paid, or a
 *     cross-business edit, is a total no-op, never a header committed with
 *     mismatched items.
 *   - The guard is a compound predicate, not a single `NOT EXISTS`: (a) the
 *     invoice's CURRENT balance (`total - paid`) must be `> 0` (not fully
 *     paid), AND (b) the submitted NEW `total` must be `>= paid` (the edit
 *     must never shrink the total below money already collected — the same
 *     overpay-safety invariant `payment-repo.ts` enforces from the other
 *     direction).
 *   - CRITICAL ORDERING (data-corruption fix): the header UPDATE MUST be the
 *     LAST statement in the transaction, run strictly AFTER the item
 *     DELETE/INSERTs. Under READ COMMITTED, a later statement in the SAME
 *     transaction sees the transaction's OWN prior writes. If the header
 *     UPDATE ran first, it would mutate `invoices.total` to the NEW total
 *     immediately, and every later item statement's guard (which re-reads
 *     `invoices.total` via a fresh correlated subquery) would then observe
 *     that NEW total instead of the pre-edit one. Concretely: when the new
 *     total exactly equals `paidAmount` (a legal edit — closing an invoice to
 *     what's been paid), the item guards would compute
 *     `(newTotal - paid) > 0` = `(0) > 0` = FALSE and silently no-op the item
 *     replacement, while the header still committed the new total — a torn,
 *     inconsistent state (header total present, but stale items) with NO
 *     error thrown. This is deterministic and requires no concurrency at all.
 *     Running every item statement BEFORE the header UPDATE guarantees they
 *     all observe the SAME pre-edit total the header's own guard uses, so
 *     the whole statement set is truly all-or-nothing.
 *   - Empirical run count (real Postgres 16 container, two concurrent `pg`
 *     connections, hold-open-then-release): baseline no-lock BROKEN 6/6;
 *     single-statement `FOR UPDATE` (payment side only) BROKEN 3/3;
 *     two-statement fix on BOTH writers CORRECT 10/10. See
 *     `openspec/changes/audit-log/design.md`'s "Open Questions" and the
 *     re-runnable `lib/db/invoice-payment-concurrency.integration.test.ts`.
 *     The mechanism (two-statement lock) is unchanged by the fully-paid
 *     rule change in `invoice-edit-partial` — only the guard predicate.
 */
export const invoiceRepo: InvoiceRepository = {
  async list(businessId: string, query: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>> {
    const invoiceRows = (await sql`SELECT * FROM invoices WHERE business_id = ${businessId}`) as unknown as InvoiceRow[];
    const paymentRows = (await sql`SELECT * FROM payments WHERE business_id = ${businessId}`) as unknown as PaymentRow[];

    let invoices = invoiceRows.map(toInvoice).map((inv) => withFinance(inv, paymentRows));

    if (query.customerId) invoices = invoices.filter((i) => i.customerId === query.customerId);
    if (query.status) invoices = invoices.filter((i) => i.status === query.status);
    if (query.from) invoices = invoices.filter((i) => i.issueDate >= query.from!);
    if (query.to) invoices = invoices.filter((i) => i.issueDate <= query.to!);

    invoices.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
    return paginate(invoices, query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<InvoiceDetail | null> {
    const rows = (await sql`SELECT * FROM invoices WHERE id = ${id}`) as unknown as InvoiceRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    return buildDetail(toInvoice(row));
  },

  async create(businessId: string, data: InvoicePersist): Promise<InvoiceDetail> {
    // Atomic per-business numbering: a single UPSERT statement, race-free
    // under Postgres's row-level locking, replacing the mock's in-process
    // withLock(businessId) mutex (which can't protect across serverless
    // instances).
    const seqRows = (await sql`
      INSERT INTO invoice_sequences (business_id, seq) VALUES (${businessId}, 1)
      ON CONFLICT (business_id) DO UPDATE SET seq = invoice_sequences.seq + 1
      RETURNING seq
    `) as unknown as { seq: number }[];
    const number = `FAC-${String(seqRows[0].seq).padStart(4, "0")}`;

    const invoiceRows = (await sql`
      INSERT INTO invoices (id, business_id, customer_id, number, issue_date, due_date, subtotal, total, status, notes)
      VALUES (gen_random_uuid(), ${businessId}, ${data.customerId}, ${number}, ${data.issueDate}, ${data.dueDate}, ${data.subtotal}, ${data.total}, ${data.status}, ${data.notes})
      RETURNING *
    `) as unknown as InvoiceRow[];
    const invoice = toInvoice(invoiceRows[0]);

    for (const item of data.items) {
      await sql`
        INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total)
        VALUES (gen_random_uuid(), ${invoice.id}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${item.lineTotal})
      `;
    }

    return buildDetail(invoice);
  },

  async update(businessId: string, id: string, data: InvoicePersist): Promise<InvoiceDetail | null> {
    // See the file-level doc comment above and `client.ts`'s canonical note.
    // EVERY statement (item DELETE, each item INSERT, header UPDATE) is
    // guarded by the SAME compound condition — "belongs to this business AND
    // NOT fully paid (balance > 0) AND the new total is not below what's
    // already paid" — and runs in ONE `sql.transaction([...])`. Because the
    // transaction is non-interactive (statement N+1 cannot be skipped based on
    // statement N's result), guarding only the header would let a
    // fully-paid or below-paid edit still wipe/replace items — so the DELETE
    // and every INSERT carry the guard too and become no-ops when it fails.
    // Net effect: header + items are replaced atomically, or nothing is
    // touched at all.
    //
    // ORDER IS SAFETY-CRITICAL: the header UPDATE runs LAST, strictly AFTER
    // the item DELETE/INSERTs. Every item guard re-reads `invoices.total` via
    // its own correlated subquery; if the header UPDATE ran first (and thus
    // committed the NEW total inside this same transaction), the later item
    // guards would observe that NEW total instead of the pre-edit one — and
    // at the exact boundary where the new total equals `paidAmount`, that
    // would make the item guards' `(newTotal - paid) > 0` evaluate to FALSE,
    // silently no-op'ing the item replacement while the header still
    // committed. Keeping the header last means every statement's guard
    // evaluates against the SAME pre-edit total, so the set is genuinely
    // all-or-nothing. See the file-level doc comment's "CRITICAL ORDERING"
    // note for the full data-corruption scenario this prevents.
    const queries = [
      // Statement 1: acquire and HOLD the invoice row lock for the whole
      // transaction. Empty result -> NOT_FOUND (missing/cross-business),
      // returned as `null`, without leaking cross-business existence.
      sql`SELECT id FROM invoices WHERE id = ${id} AND business_id = ${businessId} FOR UPDATE`,
      // Statement 2: guarded wholesale item DELETE — a no-op unless the
      // invoice still belongs to this business AND passes the
      // not-fully-paid + new-total-not-below-paid guard, evaluated against
      // the invoice's CURRENT (pre-edit) total, since the header UPDATE has
      // not run yet.
      sql`
        DELETE FROM invoice_items
        WHERE invoice_id = ${id}
          AND EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.id = ${id} AND i.business_id = ${businessId}
              AND (i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)) > 0
              AND ${data.total} >= COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)
          )
      `,
      // Statements 3..N-1: one guarded INSERT per item, written as
      // `INSERT ... SELECT ... WHERE EXISTS(guard)` so an insert is a no-op
      // (zero rows) whenever the guard is false — never a partial re-insert
      // against a fully-paid, below-paid, or cross-business invoice. Same
      // pre-edit-total guard as the DELETE above.
      ...data.items.map(
        (item) => sql`
          INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total)
          SELECT gen_random_uuid(), ${id}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${item.lineTotal}
          WHERE EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.id = ${id} AND i.business_id = ${businessId}
              AND (i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)) > 0
              AND ${data.total} >= COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)
          )
        `,
      ),
      // Statement N (LAST): fresh-snapshot compound-guarded header UPDATE (no
      // `FOR UPDATE` — statement 1 is the sole lock holder). The guard is:
      // (a) current balance (total - paid) > 0 (not fully paid), AND
      // (b) the submitted new total >= paid (never shrink below collected
      // money). Runs LAST so its own guard — and every item guard above —
      // all evaluate against the SAME pre-edit `invoices.total`; see the
      // "ORDER IS SAFETY-CRITICAL" comment above this array.
      sql`
        UPDATE invoices SET
          customer_id = ${data.customerId},
          issue_date = ${data.issueDate},
          due_date = ${data.dueDate},
          subtotal = ${data.subtotal},
          total = ${data.total},
          status = ${data.status},
          notes = ${data.notes},
          updated_at = now()
        WHERE id = ${id} AND business_id = ${businessId}
          AND (invoices.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = invoices.id), 0)) > 0
          AND ${data.total} >= COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = invoices.id), 0)
        RETURNING *
      `,
    ];

    const results = await runTransaction<unknown[]>(queries);
    const lockRows = results[0] as { id: string }[];
    // Header UPDATE is now the LAST statement in the transaction (see the
    // "ORDER IS SAFETY-CRITICAL" comment above) — index it from the end, not
    // a fixed offset, so it stays correct regardless of item count.
    const updatedRows = results[results.length - 1] as InvoiceRow[];

    if (lockRows.length === 0) {
      // Missing or cross-business: `null`, never leaked — matches
      // `getById`'s convention; the service maps this to `NOT_FOUND`.
      return null;
    }
    if (updatedRows.length === 0) {
      // Invoice exists, but the header UPDATE's compound guard excluded the
      // update -> either the invoice is fully paid, or the submitted new
      // total is below the amount already paid -> reject. The guarded
      // DELETE/INSERTs earlier in the SAME transaction were no-ops too, so
      // ZERO mutation occurred (not a NOT_FOUND, not a torn header/items
      // state).
      //
      // Repository-layer error code note: this is a SINGLE ANDed SQL guard,
      // so the repository CANNOT distinguish which of the two conditions
      // failed (fully paid vs. below-paid-total) — it always throws a
      // generic `CONFLICT` here, regardless of which one caused the
      // rejection. That is intentional and correct at THIS layer: this path
      // is the atomic race-only fallback (reached when the service layer's
      // own checks already passed but a payment landed concurrently before
      // this transaction ran), and a concurrent payment IS a conflict. The
      // service layer (`invoice-service.ts#updateInvoice`) is the one that
      // distinguishes the two causes for the common, non-race case:
      // `CONFLICT` for a fully-paid invoice, `VALIDATION_ERROR` for a
      // user-submitted below-paid-total edit.
      throw new ApiError(
        "CONFLICT",
        "Invoice cannot be edited: it is fully paid, or the new total is below the amount already paid.",
      );
    }

    // Header + items already committed atomically above; re-read for the
    // returned detail.
    return buildDetail(toInvoice(updatedRows[0]!));
  },
};
