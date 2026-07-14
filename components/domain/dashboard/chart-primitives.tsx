"use client";

import * as React from "react";
import { formatCOP } from "@/lib/money";

/**
 * Shared recharts primitives for `dashboard-chart-cards.tsx` (Ingresos) and
 * `expense-chart-cards.tsx` (Egresos), so both chart sets share one tooltip
 * and empty-state implementation instead of duplicating them.
 */

/**
 * Wraps a recharts `ResponsiveContainer` chart and only mounts it once its
 * own box has a non-zero size. Both dashboard tabs use `keepMounted`, so the
 * INACTIVE tab renders at `display:none` (0×0) — mounting a `ResponsiveContainer`
 * there makes recharts log "width(0) and height(0) of chart should be greater
 * than 0" on every render. Gating on measured size avoids that entirely and
 * defers the chart work until the tab is actually shown; when the user
 * switches tabs the ResizeObserver fires (0 → real size) and the chart mounts.
 *
 * jsdom has no layout engine and (by default) no `ResizeObserver`, so there it
 * falls back to rendering immediately — preserving existing test behavior
 * (which asserts the chart renders given data, and ignores recharts' dev warning).
 */
function useHasRenderableSize(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return () => {};
      // ResizeObserver fires once immediately on observe(), so the snapshot is
      // re-read right after mount without a synchronous setState in an effect.
      const observer = new ResizeObserver(onChange);
      observer.observe(el);
      return () => observer.disconnect();
    },
    [ref],
  );
  const getSnapshot = () => {
    // jsdom (tests) and very old browsers have no ResizeObserver / no layout —
    // render immediately there so the chart still mounts under test.
    if (typeof ResizeObserver === "undefined") return true;
    const el = ref.current;
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  };
  // Server render (and the matching first client render before the ref is
  // attached) reports "no size", so the chart is deferred rather than mounted
  // at 0×0 — no hydration mismatch, no recharts 0-width warning.
  const getServerSnapshot = () => false;
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ChartFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const ready = useHasRenderableSize(ref);

  return (
    <div ref={ref} className={className}>
      {ready ? children : null}
    </div>
  );
}

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
  seriesLabels,
  extraLines,
}: {
  active?: boolean;
  label?: unknown;
  payload?: readonly ChartTooltipPayload[];
  valueLabel: string;
  // Optional per-series label override keyed by the Bar's `dataKey` — for
  // multi-series/grouped charts (e.g. "Facturado vs Cobrado por mes") where
  // each payload item needs its own label instead of one shared `valueLabel`.
  // Series without a matching key fall back to `valueLabel`.
  seriesLabels?: Record<string, string>;
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
      {payload.map((item, index) => {
        const seriesKey = item.dataKey != null ? String(item.dataKey) : undefined;
        const itemLabel = (seriesKey && seriesLabels?.[seriesKey]) ?? valueLabel;
        return (
          <div key={`${String(item.dataKey ?? item.name ?? valueLabel)}-${index}`} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: item.color ?? "var(--primary)" }} />
            <span className="text-muted-foreground">{itemLabel}:</span>
            <span className="font-medium tabular-nums">{formatTooltipMoney(item.value)}</span>
          </div>
        );
      })}
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
