import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/services/status";

/**
 * Renders one color-coded `Badge` per `InvoiceStatus`, per
 * `docs/ui-ux-flow.md`'s "Estados visuales" section:
 * `pending` -> pendiente, `partially_paid` -> parcialmente pagada,
 * `paid` -> pagada, `overdue` -> vencida. Labels are unchanged; each status
 * gets its own deliberate color using the existing `--chart-*`/
 * `--destructive` tokens from `app/globals.css` (no new colors) so
 * "needs attention" (amber), "in progress" (blue), "resolved" (teal), and
 * "urgent" (red) are distinguishable at a glance — the old generic
 * outline/secondary variants made `pending` and `partially_paid` both read
 * as plain gray.
 */
const STATUS_CONFIG: Record<InvoiceStatus, { label: string; className: string }> = {
  pending: {
    label: "Pendiente",
    className: "border-chart-5/30 bg-chart-5/15 text-chart-5 dark:border-chart-5/40 dark:bg-chart-5/20",
  },
  partially_paid: {
    label: "Parcialmente pagada",
    className: "border-chart-2/30 bg-chart-2/15 text-chart-2 dark:border-chart-2/40 dark:bg-chart-2/20",
  },
  paid: {
    label: "Pagada",
    className: "border-chart-1/30 bg-chart-1/15 text-chart-1 dark:border-chart-1/40 dark:bg-chart-1/20",
  },
  overdue: {
    label: "Vencida",
    className: "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
