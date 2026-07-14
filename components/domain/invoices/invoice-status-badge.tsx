import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/services/status";

/**
 * Renders one color-coded `Badge` per `InvoiceStatus`, per
 * `docs/ui-ux-flow.md`'s "Estados visuales" section:
 * `pending` -> pendiente, `partially_paid` -> parcialmente pagada,
 * `paid` -> pagada, `overdue` -> vencida. Labels are unchanged; each status
 * maps to a dedicated `Badge` variant backed by the semantic
 * `--warning`/`--info`/`--success`/`--destructive` tokens from
 * `app/globals.css` so "needs attention" (warning), "in progress" (info),
 * "resolved" (success), and "urgent" (destructive) are distinguishable at a
 * glance — the old generic outline/secondary variants made `pending` and
 * `partially_paid` both read as plain gray.
 */
const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; variant: "success" | "warning" | "info" | "destructive" }
> = {
  pending: {
    label: "Pendiente",
    variant: "warning",
  },
  partially_paid: {
    label: "Parcialmente pagada",
    variant: "info",
  },
  paid: {
    label: "Pagada",
    variant: "success",
  },
  overdue: {
    label: "Vencida",
    variant: "destructive",
  },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
