import { listCustomers } from "@/lib/services/customer-service";
import { listInvoices } from "@/lib/services/invoice-service";
import { listPayments } from "@/lib/services/payment-service";
import type {
  CustomerWithBalance,
  InvoiceListQuery,
  InvoiceWithFinance,
  PaymentListQuery,
  PaymentWithRefs,
  Session,
} from "@/lib/services/ports";

const EXPORT_PAGE_SIZE = 50;

async function collectPaged<T>(fetchPage: (page: number) => Promise<{ data: T[]; total: number }>): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (rows.length < total) {
    const result = await fetchPage(page);
    rows.push(...result.data);
    total = result.total;
    if (result.data.length === 0) {
      break;
    }
    page += 1;
  }

  return rows;
}

export async function collectAllInvoices(
  session: Session,
  filters: Omit<InvoiceListQuery, "page" | "pageSize">,
): Promise<InvoiceWithFinance[]> {
  return collectPaged((page) => listInvoices(session, { ...filters, page, pageSize: EXPORT_PAGE_SIZE }));
}

export async function collectAllPayments(
  session: Session,
  filters: Omit<PaymentListQuery, "page" | "pageSize">,
): Promise<PaymentWithRefs[]> {
  return collectPaged((page) => listPayments(session, { ...filters, page, pageSize: EXPORT_PAGE_SIZE }));
}

export async function collectAllCustomers(session: Session): Promise<CustomerWithBalance[]> {
  return collectPaged((page) => listCustomers(session, { page, pageSize: EXPORT_PAGE_SIZE }));
}
