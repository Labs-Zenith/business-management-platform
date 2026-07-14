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
import type { DashboardCharts as DashboardChartsData } from "@/lib/services/dashboard-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame, ChartTooltip, type ChartTooltipPayload, EmptyChart } from "./chart-primitives";

type DashboardChartCardsProps = {
  charts: DashboardChartsData;
};

type ReceivableRow = DashboardChartsData["receivablesByStatus"][number];

const STATUS_COLORS = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-4)",
];

const INVOICED_VS_PAID_SERIES_LABELS: Record<string, string> = {
  facturado: "Facturado",
  cobrado: "Cobrado",
};

export function DashboardChartCards({ charts }: DashboardChartCardsProps) {
  const receivableRows = charts.receivablesByStatus.filter((row) => row.count > 0 || row.balance > 0);
  const debtorRows = charts.topDebtorBalances;
  const paymentRows = charts.monthlyPayments;
  const invoicedRows = charts.monthlyInvoiced;
  // Both series share the same 6-month `label` axis (aligned by index), so
  // they're merged into one row per month for recharts' grouped BarChart.
  const invoicedVsPaidRows = paymentRows.map((row, index) => ({
    label: row.label,
    cobrado: row.amount,
    facturado: invoicedRows[index]?.amount ?? 0,
  }));
  const hasInvoicedVsPaid =
    paymentRows.some((row) => row.amount > 0) || invoicedRows.some((row) => row.amount > 0);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Pendiente por cobrar por estado</CardTitle>
        </CardHeader>
        <CardContent>
          {receivableRows.length === 0 ? (
            <EmptyChart label="Sin facturas para graficar." />
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
                      // "Pagada" always has balance 0 by definition (paid = balance 0),
                      // so surface `total` and `count` too — otherwise that bar's
                      // tooltip reads "Saldo: $0" with no context.
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

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Mayores saldos</CardTitle>
        </CardHeader>
        <CardContent>
          {debtorRows.length === 0 ? (
            <EmptyChart label="Sin saldos pendientes." />
          ) : (
            <ChartFrame className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={debtorRows}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={96}
                    fontSize={12}
                    tickFormatter={(value) => (String(value).length > 14 ? `${String(value).slice(0, 14)}...` : value)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={(props) => <ChartTooltip {...props} valueLabel="Saldo" />}
                  />
                  <Bar dataKey="balance" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Facturado vs Cobrado por mes</CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-5)" }} />
                Facturado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} />
                Cobrado
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!hasInvoicedVsPaid ? (
            <EmptyChart label="Sin pagos en los ultimos meses." />
          ) : (
            <ChartFrame className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={invoicedVsPaidRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={(props) => (
                      <ChartTooltip {...props} valueLabel="Monto" seriesLabels={INVOICED_VS_PAID_SERIES_LABELS} />
                    )}
                  />
                  <Bar dataKey="facturado" name="Facturado" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="cobrado" name="Cobrado" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
