import type {
  Customer,
  CustomerCreate,
  CustomerDeleteResult,
  CustomerDetail,
  CustomerListQuery,
  CustomerRepository,
  CustomerUpdate,
  CustomerWithBalance,
  InvoiceWithFinance,
  Paged,
  PaymentWithRefs,
} from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { runTransaction, sql } from "./client";
import { customerSorter } from "@/lib/services/sorting";

/**
 * Same strategy throughout `lib/db/*`: fetch business-scoped rows in bulk
 * via simple parameterized queries, then filter/sort/paginate/aggregate in
 * JS — mirroring `lib/mock/*-repo.ts` almost line-for-line. Demo-scale data
 * volumes make this both fast to write correctly and fast to run; the only
 * places that need real DB-level atomicity (invoice numbering, overpay-safe
 * payment insert) use dedicated single atomic statements instead (see
 * `invoice-repo.ts`/`payment-repo.ts`).
 */

type CustomerRow = {
  id: string;
  business_id: string;
  name: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type InvoiceRow = {
  id: string;
  business_id: string;
  customer_id: string;
  invoice_type_id: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  total: number;
  status: string;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

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
  voided_at: string | null;
  created_at: string;
  updated_at: string;
};

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

function toDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function withFinance(invoice: InvoiceRow, payments: PaymentRow[]): InvoiceWithFinance {
  // Mirrors `lib/db/invoice-repo.ts#withFinance`: a voided invoice's status
  // comes from the persisted marker, not from `computeStatus`, and its
  // amounts collapse to zero.
  const isVoided = Boolean(invoice.voided_at);
  const paidAmount = isVoided
    ? 0
    : payments
        .filter((p) => String(p.invoice_id) === String(invoice.id) && !p.voided_at)
        .reduce((sum, p) => sum + Number(p.amount), 0);
  const total = Number(invoice.total);
  const balance = isVoided ? 0 : total - paidAmount;
  const status: InvoiceWithFinance["status"] = isVoided
    ? "voided"
    : computeStatus(total, paidAmount, invoice.due_date ? toDateStr(invoice.due_date) : null, new Date());
  return {
    id: invoice.id,
    businessId: invoice.business_id,
    customerId: invoice.customer_id,
    invoiceTypeId: invoice.invoice_type_id,
    number: invoice.number,
    issueDate: toDateStr(invoice.issue_date),
    dueDate: invoice.due_date ? toDateStr(invoice.due_date) : null,
    subtotal: Number(invoice.subtotal),
    total,
    status,
    notes: invoice.notes,
    voidedAt: invoice.voided_at ? new Date(invoice.voided_at).toISOString() : null,
    voidedBy: invoice.voided_by,
    voidReason: invoice.void_reason,
    createdAt: new Date(invoice.created_at).toISOString(),
    updatedAt: new Date(invoice.updated_at).toISOString(),
    paidAmount,
    balance,
  };
}

function toPaymentWithRefs(
  payment: PaymentRow,
  customer: { id: string; name: string },
  invoiceNumber: string
): PaymentWithRefs {
  return {
    id: payment.id,
    businessId: payment.business_id,
    invoiceId: payment.invoice_id,
    customerId: payment.customer_id,
    paymentDate: toDateStr(payment.payment_date),
    amount: Number(payment.amount),
    method: payment.method,
    methodId: payment.method_id,
    notes: payment.notes,
    voidedAt: payment.voided_at ? new Date(payment.voided_at).toISOString() : null,
    createdAt: new Date(payment.created_at).toISOString(),
    updatedAt: new Date(payment.updated_at).toISOString(),
    customer,
    invoice: { id: payment.invoice_id, number: invoiceNumber },
  };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

export const customerRepo: CustomerRepository = {
  async list(businessId: string, query: CustomerListQuery): Promise<Paged<CustomerWithBalance>> {
    const customerRows = (await sql`SELECT * FROM customers WHERE business_id = ${businessId}`) as unknown as CustomerRow[];
    const invoiceRows = (await sql`SELECT * FROM invoices WHERE business_id = ${businessId}`) as unknown as InvoiceRow[];
    const paymentRows = (await sql`SELECT * FROM payments WHERE business_id = ${businessId}`) as unknown as PaymentRow[];

    let customers = customerRows.map(toCustomer);

    if (query.status) {
      const wantActive = query.status === "active";
      customers = customers.filter((c) => c.isActive === wantActive);
    }
    if (query.q) {
      const needle = query.q.trim().toLowerCase();
      customers = customers.filter((c) =>
        [c.name, c.documentNumber, c.email, c.phone].some((field) => field?.toLowerCase().includes(needle))
      );
    }
    // A VOIDED invoice (and its voided payments) must contribute nothing to
    // the balance — the whole point of voiding. This aggregate reads the raw
    // rows rather than going through `invoiceRepo.list`, so it has to exclude
    // them itself.
    const liveInvoices = invoiceRows.filter((i) => !i.voided_at);
    const livePayments = paymentRows.filter((p) => !p.voided_at);

    const withBalance: CustomerWithBalance[] = customers.map((c) => {
      const invoiced = liveInvoices.filter((i) => String(i.customer_id) === String(c.id)).reduce((s, i) => s + Number(i.total), 0);
      const paid = livePayments.filter((p) => String(p.customer_id) === String(c.id)).reduce((s, p) => s + Number(p.amount), 0);
      return { ...c, balance: invoiced - paid };
    });

    // Sorted AFTER the balance map, not before it (as the old fixed name sort
    // was): `balance` is a sortable column and does not exist until here.
    return paginate(customerSorter.sort(withBalance, query), query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<CustomerDetail | null> {
    const rows = (await sql`SELECT * FROM customers WHERE id = ${id}`) as unknown as CustomerRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    const customer = toCustomer(row);

    const invoiceRows = (await sql`SELECT * FROM invoices WHERE customer_id = ${id}`) as unknown as InvoiceRow[];
    const paymentRows = (await sql`SELECT * FROM payments WHERE customer_id = ${id}`) as unknown as PaymentRow[];

    const invoicesWithFinance = invoiceRows.map((inv) => withFinance(inv, paymentRows));
    // Same exclusion as `list`: a voided invoice and its voided payments drop
    // out of the totals. They stay in `recentInvoices`/`recentPayments`
    // below, shown with their "Anulada" status, so the history is still
    // visible — it just does not add up to anything.
    const totalInvoiced = invoicesWithFinance
      .filter((i) => i.status !== "voided")
      .reduce((s, i) => s + i.total, 0);
    const totalPaid = paymentRows.filter((p) => !p.voided_at).reduce((s, p) => s + Number(p.amount), 0);

    const recentInvoices = [...invoicesWithFinance].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).slice(0, 5);
    const recentPayments = [...paymentRows]
      .sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))
      .slice(0, 5)
      .map((p) => {
        const inv = invoiceRows.find((i) => String(i.id) === String(p.invoice_id));
        return toPaymentWithRefs(p, { id: customer.id, name: customer.name }, inv?.number ?? "");
      });

    return {
      ...customer,
      totalInvoiced,
      totalPaid,
      balance: totalInvoiced - totalPaid,
      recentInvoices,
      recentPayments,
    };
  },

  async create(businessId: string, data: CustomerCreate): Promise<Customer> {
    const rows = (await sql`
      INSERT INTO customers (id, business_id, name, document_number, email, phone, address, notes, is_active)
      VALUES (gen_random_uuid(), ${businessId}, ${data.name}, ${data.documentNumber ?? null}, ${data.email ?? null}, ${data.phone ?? null}, ${data.address ?? null}, ${data.notes ?? null}, true)
      RETURNING *
    `) as unknown as CustomerRow[];
    return toCustomer(rows[0]);
  },

  async update(businessId: string, id: string, data: CustomerUpdate): Promise<Customer | null> {
    const existingRows = (await sql`SELECT * FROM customers WHERE id = ${id}`) as unknown as CustomerRow[];
    const existing = existingRows[0];
    if (!existing || existing.business_id !== businessId) return null;

    const merged = { ...toCustomer(existing), ...data };
    const rows = (await sql`
      UPDATE customers SET
        name = ${merged.name},
        document_number = ${merged.documentNumber ?? null},
        email = ${merged.email ?? null},
        phone = ${merged.phone ?? null},
        address = ${merged.address ?? null},
        notes = ${merged.notes ?? null},
        is_active = ${merged.isActive},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `) as unknown as CustomerRow[];
    return toCustomer(rows[0]);
  },

  async delete(businessId: string, id: string): Promise<CustomerDeleteResult> {
    // Guarded hard delete, same rule as `productRepo.delete`: a customer any
    // invoice or payment still references is REFUSED, so a catalog edit never
    // destroys billing history (see `CustomerDeleteResult` in `ports.ts`).
    return runTransaction(async (tx) => {
      // Statement 1: lock the customer row and HOLD it — `client.ts`'s
      // canonical two-statement pattern. A concurrent invoice or payment
      // insert needs `FOR KEY SHARE` on this row for its FK check, so it
      // cannot land between the count below and the delete.
      const lockRows = (await tx`
        SELECT id FROM customers WHERE id = ${id} AND business_id = ${businessId} FOR UPDATE
      `) as unknown as { id: string }[];
      if (lockRows.length === 0) return { outcome: "not_found" } as const;

      // Statement 2: fresh-snapshot reference counts, safe to trust now that
      // the lock forecloses new references appearing mid-transaction.
      const countRows = (await tx`
        SELECT
          (SELECT COUNT(*)::int FROM invoices WHERE customer_id = ${id} AND business_id = ${businessId}) AS invoice_count,
          (SELECT COUNT(*)::int FROM payments WHERE customer_id = ${id} AND business_id = ${businessId}) AS payment_count
      `) as unknown as { invoice_count: number; payment_count: number }[];
      const invoiceCount = Number(countRows[0]!.invoice_count);
      const paymentCount = Number(countRows[0]!.payment_count);
      if (invoiceCount > 0 || paymentCount > 0) {
        return { outcome: "conflict", invoiceCount, paymentCount } as const;
      }

      // `pipeline_cards.customer_id` is nullable: detach the card instead of
      // blocking on it or deleting the user's kanban work.
      await tx`
        UPDATE pipeline_cards SET customer_id = NULL, updated_at = now()
        WHERE customer_id = ${id} AND business_id = ${businessId}
      `;
      await tx`DELETE FROM customers WHERE id = ${id} AND business_id = ${businessId}`;
      return { outcome: "deleted" } as const;
    });
  },
};
