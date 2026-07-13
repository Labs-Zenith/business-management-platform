"use client";

import { formatCOP } from "@/lib/money";

/**
 * Shared recharts primitives for `dashboard-chart-cards.tsx` (Ingresos) and
 * `expense-chart-cards.tsx` (Egresos), so both chart sets share one tooltip
 * and empty-state implementation instead of duplicating them.
 */

export function formatTooltipMoney(value: unknown) {
  const amount = Array.isArray(value) ? value[0] : value;
  return formatCOP(Number(amount ?? 0));
}

export type ChartTooltipPayload = {
  value?: unknown;
  name?: unknown;
  dataKey?: unknown;
  color?: string;
  // The full underlying data row recharts attaches to each tooltip item —
  // used to surface secondary fields (e.g. total/count) beyond the plotted value.
  payload?: Record<string, unknown>;
};

export function ChartTooltip({
  active,
  label,
  payload,
  valueLabel,
  extraLines,
}: {
  active?: boolean;
  label?: unknown;
  payload?: readonly ChartTooltipPayload[];
  valueLabel: string;
  // Optional secondary label/value lines rendered below the plotted value —
  // e.g. "Total facturado" and "Facturas" on the receivables-by-status chart,
  // so a $0 "Saldo" on the Pagada bar is explained rather than looking empty.
  extraLines?: readonly { label: string; value: string }[];
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-sm">
      <p className="mb-1 font-medium">{String(label ?? "")}</p>
      {payload.map((item, index) => (
        <div key={`${String(item.dataKey ?? item.name ?? valueLabel)}-${index}`} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color ?? "var(--primary)" }} />
          <span className="text-muted-foreground">{valueLabel}:</span>
          <span className="font-medium tabular-nums">{formatTooltipMoney(item.value)}</span>
        </div>
      ))}
      {extraLines?.map((line) => (
        <div key={line.label} className="mt-1 flex items-center gap-2 pl-4">
          <span className="text-muted-foreground">{line.label}:</span>
          <span className="font-medium tabular-nums">{line.value}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  );
}
