"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PeriodCharts } from "@/lib/services/dashboard-service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame, ChartTooltip, EmptyChart } from "./chart-primitives";

/**
 * "Facturado vs Cobrado por mes" — the Ingresos tab's period-scoped chart.
 *
 * The two series behind it (`monthlyInvoiced`/`monthlyPayments`) were already
 * computed by `getDashboardCharts` but only ever reached the Excel/PDF export;
 * nothing rendered them on screen. Once the point-in-time charts moved out to
 * the "Cartera (a hoy)" section, this is what gives the Ingresos tab an actual
 * view of the selected period's movement.
 *
 * Facturado ≠ Cobrado is the whole point of showing them together: a tall
 * "Facturado" bar next to a short "Cobrado" one is money invoiced but not yet
 * collected. `ChartTooltip`'s `seriesLabels` exists for exactly this chart.
 */

const SERIES_LABELS = { facturado: "Facturado", cobrado: "Cobrado" };

type TrendRow = { month: string; label: string; facturado: number; cobrado: number };

export function IngresosTrendChart({ charts }: { charts: PeriodCharts }) {
  // The two series are emitted over the same `period.chartMonths` and are
  // aligned by index, so zipping by position is safe; `month` is carried
  // through as the React key.
  const rows: TrendRow[] = charts.monthlyInvoiced.map((invoiced, index) => ({
    month: invoiced.month,
    label: invoiced.label,
    facturado: invoiced.amount,
    cobrado: charts.monthlyPayments[index]?.amount ?? 0,
  }));

  const hasAnyAmount = rows.some((row) => row.facturado > 0 || row.cobrado > 0);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Facturado vs cobrado por mes</CardTitle>
        <CardDescription>
          Lo que facturaste frente a lo que cobraste, en los últimos seis meses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAnyAmount ? (
          <EmptyChart label="Todavía no hay datos para esta gráfica." />
        ) : (
          <ChartFrame className="h-52 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={(props) => <ChartTooltip {...props} valueLabel="Monto" seriesLabels={SERIES_LABELS} />}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-caption text-muted-foreground">
                      {SERIES_LABELS[value as keyof typeof SERIES_LABELS] ?? value}
                    </span>
                  )}
                />
                <Bar dataKey="facturado" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="cobrado" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}
