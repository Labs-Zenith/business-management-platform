import type {
  Customer,
  CustomerCreate,
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
import { sql } from "./client";
import { ensureMigrated } from "./migrate";

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
  const paidAmount = payments
    .filter((p) => String(p.invoice_id) === String(invoice.id))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const total = Number(invoice.total);
  const balance = total - paidAmount;
  const status = computeStatus(total, paidAmount, invoice.due_date ? toDateStr(invoice.due_date) : null, new Date());
  return {
    id: invoice.id,
    businessId: invoice.business_id,
    customerId: invoice.customer_id,
    number: invoice.number,
    issueDate: toDateStr(invoice.issue_date),
    dueDate: invoice.due_date ? toDateStr(invoice.due_date) : null,
    subtotal: Number(invoice.subtotal),
    total,
    status,
    notes: invoice.notes,
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
    notes: payment.notes,
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
    await ensureMigrated();
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
    customers.sort((a, b) => a.name.localeCompare(b.name));

    const withBalance: CustomerWithBalance[] = customers.map((c) => {
      const invoiced = invoiceRows.filter((i) => String(i.customer_id) === String(c.id)).reduce((s, i) => s + Number(i.total), 0);
      const paid = paymentRows.filter((p) => String(p.customer_id) === String(c.id)).reduce((s, p) => s + Number(p.amount), 0);
      return { ...c, balance: invoiced - paid };
    });

    return paginate(withBalance, query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<CustomerDetail | null> {
    await ensureMigrated();
    const rows = (await sql`SELECT * FROM customers WHERE id = ${id}`) as unknown as CustomerRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    const customer = toCustomer(row);

    const invoiceRows = (await sql`SELECT * FROM invoices WHERE customer_id = ${id}`) as unknown as InvoiceRow[];
    const paymentRows = (await sql`SELECT * FROM payments WHERE customer_id = ${id}`) as unknown as PaymentRow[];

    const invoicesWithFinance = invoiceRows.map((inv) => withFinance(inv, paymentRows));
    const totalInvoiced = invoicesWithFinance.reduce((s, i) => s + i.total, 0);
    const totalPaid = paymentRows.reduce((s, p) => s + Number(p.amount), 0);

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
    await ensureMigrated();
    const rows = (await sql`
      INSERT INTO customers (id, business_id, name, document_number, email, phone, address, notes, is_active)
      VALUES (gen_random_uuid(), ${businessId}, ${data.name}, ${data.documentNumber ?? null}, ${data.email ?? null}, ${data.phone ?? null}, ${data.address ?? null}, ${data.notes ?? null}, true)
      RETURNING *
    `) as unknown as CustomerRow[];
    return toCustomer(rows[0]);
  },

  async update(businessId: string, id: string, data: CustomerUpdate): Promise<Customer | null> {
    await ensureMigrated();
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
};
