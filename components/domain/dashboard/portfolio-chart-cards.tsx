"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCOP } from "@/lib/money";
import type { PortfolioCharts } from "@/lib/services/dashboard-service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame, ChartTooltip, type ChartTooltipPayload, EmptyChart } from "./chart-primitives";

type PortfolioChartCardsProps = {
  charts: PortfolioCharts;
};

type ReceivableRow = PortfolioCharts["receivablesByStatus"][number];

const STATUS_COLORS = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-4)",
];

/**
 * "Por cobrar por estado" — a live snapshot of the outstanding balance, split
 * by invoice status. Belongs to the dashboard's "Cobros pendientes" section
 * and never moves with a date range; the range-scoped trend chart is
 * `ingresos-trend-chart.tsx`.
 *
 * This used to render a second card, "Mayores deudores", which plotted exactly
 * the same `getTopDebtors` rows that `top-debtors.tsx` already lists in a
 * table on the same screen — the same five customers and the same balances,
 * under two different names. The table won: it links through to each customer.
 * The export still renders its own debtor chart from
 * `charts.topDebtorBalances`, which is why `PortfolioCharts` keeps returning it.
 *
 * No longer wraps itself in a `min-w-0` `<div>`: `dashboard-charts.tsx` now
 * places this card directly into its own `grid min-w-0 ...` alongside
 * `IngresosTrendChart`, and that grid is what owns the `min-w-0` needed to
 * keep a wide chart from blowing out its column — this card only needs it on
 * the `Card` itself.
 */
export function PortfolioChartCards({ charts }: PortfolioChartCardsProps) {
  // "Pagada" always has balance 0 by definition (paid = balance 0), so it
  // adds a visually flat, uninformative bar to this outstanding-balance
  // chart — excluded here (kept in the export renderer's own filter too).
  const receivableRows = charts.receivablesByStatus.filter(
    (row) => (row.count > 0 || row.balance > 0) && row.status !== "paid",
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Por cobrar por estado</CardTitle>
        <CardDescription>
          Cuánto te deben, según en qué punto va cada factura.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {receivableRows.length === 0 ? (
          <EmptyChart label="Todavía no hay datos para esta gráfica." />
        ) : (
          <ChartFrame className="h-52 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={receivableRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={(props) => {
                    // Surface `total` and `count` alongside the outstanding
                    // balance so each status bar has full context, not just
                    // the (partial) balance amount.
                    const rows = props.payload as readonly ChartTooltipPayload[] | undefined;
                    const datum = rows?.[0]?.payload as ReceivableRow | undefined;
                    return (
                      <ChartTooltip
                        {...props}
                        valueLabel="Saldo"
                        extraLines={
                          datum
                            ? [
                                { label: "Total facturado", value: formatCOP(datum.total) },
                                { label: "Facturas", value: String(datum.count) },
                              ]
                            : undefined
                        }
                      />
                    );
                  }}
                />
                <Bar dataKey="balance" radius={[6, 6, 0, 0]}>
                  {receivableRows.map((_, index) => (
                    <Cell key={index} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}
