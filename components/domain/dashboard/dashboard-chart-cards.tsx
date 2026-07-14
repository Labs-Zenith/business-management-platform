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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function DashboardChartCards({ charts }: DashboardChartCardsProps) {
  // "Pagada" always has balance 0 by definition (paid = balance 0), so it
  // adds a visually flat, uninformative bar to this outstanding-balance
  // chart — excluded here (kept in the export renderer's own filter too).
  const receivableRows = charts.receivablesByStatus.filter(
    (row) => (row.count > 0 || row.balance > 0) && row.status !== "paid",
  );
  const debtorRows = charts.topDebtorBalances;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Pendiente por cobrar por estado</CardTitle>
          <CardDescription>
            Cuánto te deben tus clientes, agrupado por el estado de la factura.
          </CardDescription>
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

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Mayores deudores</CardTitle>
          <CardDescription>
            Clientes que más te deben (saldo pendiente) — no los que más han comprado.
          </CardDescription>
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
    </div>
  );
}
