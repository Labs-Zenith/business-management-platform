import type { ReactNode } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/**
 * Shared KPI card — a muted `label` + prominent `value` inside a `Card`,
 * replacing the duplicated markup in `dashboard/kpi-cards.tsx`,
 * `dashboard/expense-kpi-cards.tsx`, and the local `SummaryCard` in
 * `invoices/[id]/page.tsx`. `value` is typically a pre-formatted node (e.g.
 * `<MoneyAmount cents={...} size="lg" />`, whose own type classes take
 * precedence) or plain text/number — this component only owns the
 * label/value layout and the `text-card-title` prominence, not the
 * formatting.
 */
export function StatCard({ label, value, icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className={cn(icon ? "flex-row items-start justify-between" : undefined)}>
        <div className="flex flex-col gap-1">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-card-title font-semibold">{value}</CardTitle>
        </div>
        {icon ? <span className="text-muted-foreground [&_svg]:size-5">{icon}</span> : null}
      </CardHeader>
    </Card>
  );
}
