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

type DashboardChartCardsProps = {
  charts: DashboardChartsData;
};

const STATUS_COLORS = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-4)",
];

function moneyTooltip(value: unknown) {
  const amount = Array.isArray(value) ? value[0] : value;
  return formatCOP(Number(amount ?? 0));
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function DashboardChartCards({ charts }: DashboardChartCardsProps) {
  const receivableRows = charts.receivablesByStatus.filter((row) => row.count > 0 || row.balance > 0);
  const debtorRows = charts.topDebtorBalances;
  const paymentRows = charts.monthlyPayments;
  const hasPayments = paymentRows.some((row) => row.amount > 0);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Saldo por estado</CardTitle>
        </CardHeader>
        <CardContent>
          {receivableRows.length === 0 ? (
            <EmptyChart label="Sin facturas para graficar." />
          ) : (
            <div className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={receivableRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    formatter={moneyTooltip}
                    labelClassName="text-foreground"
                    contentStyle={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="balance" radius={[6, 6, 0, 0]}>
                    {receivableRows.map((_, index) => (
                      <Cell key={index} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
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
            <div className="h-52 min-w-0">
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
                    formatter={moneyTooltip}
                    contentStyle={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="balance" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Pagos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasPayments ? (
            <EmptyChart label="Sin pagos en los ultimos meses." />
          ) : (
            <div className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paymentRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    formatter={moneyTooltip}
                    contentStyle={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="amount" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
