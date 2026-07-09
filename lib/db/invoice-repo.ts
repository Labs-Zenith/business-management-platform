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
import { sql } from "./client";
import { ensureMigrated } from "./migrate";

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

export const invoiceRepo: InvoiceRepository = {
  async list(businessId: string, query: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>> {
    await ensureMigrated();
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
    await ensureMigrated();
    const rows = (await sql`SELECT * FROM invoices WHERE id = ${id}`) as unknown as InvoiceRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;
    return buildDetail(toInvoice(row));
  },

  async create(businessId: string, data: InvoicePersist): Promise<InvoiceDetail> {
    await ensureMigrated();

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
};
