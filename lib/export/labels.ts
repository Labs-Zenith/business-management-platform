import type { InvoiceStatus } from "@/lib/services/status";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: "Pendiente",
  partially_paid: "Parcialmente pagada",
  paid: "Pagada",
  overdue: "Vencida",
};

export function exportDateStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
