import type { ReactNode } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  /**
   * Small caption under `value` naming the window the figure covers (e.g.
   * "hoy", "julio 2026"). This is what makes the dashboard's old two-section
   * split ("Cobros pendientes" vs. "Últimos 30 días") unnecessary: each
   * figure states its own scope right next to the number instead of
   * inheriting it from a heading above a group of cards.
   */
  hint?: ReactNode;
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
export function StatCard({ label, value, hint, icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className={cn(icon ? "flex-row items-start justify-between" : undefined)}>
        <div className="flex flex-col gap-1">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-card-title font-semibold">{value}</CardTitle>
          {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? <span className="text-muted-foreground [&_svg]:size-5">{icon}</span> : null}
      </CardHeader>
    </Card>
  );
}
