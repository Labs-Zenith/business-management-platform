import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/services/status";

/**
 * Renders one shadcn `Badge` variant/label per `InvoiceStatus`, per
 * `docs/ui-ux-flow.md`'s "Estados visuales" section:
 * `pending` -> pendiente, `partially_paid` -> parcialmente pagada,
 * `paid` -> pagada, `overdue` -> vencida.
 */
const STATUS_CONFIG: Record<InvoiceStatus, { label: string; variant: "outline" | "secondary" | "default" | "destructive" }> = {
  pending: { label: "Pendiente", variant: "outline" },
  partially_paid: { label: "Parcialmente pagada", variant: "secondary" },
  paid: { label: "Pagada", variant: "default" },
  overdue: { label: "Vencida", variant: "destructive" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
