"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ExpensesByCategoryDatum, ExpensesByMonthDatum } from "@/lib/services/expense-dashboard-service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame, ChartTooltip, EmptyChart } from "./chart-primitives";

/**
 * Egresos chart parity with `dashboard-chart-cards.tsx`'s Ingresos charts:
 * same recharts primitives (`ResponsiveContainer`/`BarChart`/`CartesianGrid`/
 * `XAxis`/`YAxis`/shared `ChartTooltip`), but a 2-color amber/warm palette
 * (`--chart-5`/`--chart-4`) instead of the teal/blue income palette, so
 * expenses read visually distinct from income at a glance.
 */

type ExpenseChartCardsProps = {
  charts: {
    byCategory: ExpensesByCategoryDatum[];
    byMonth: ExpensesByMonthDatum[];
  };
};

const EXPENSE_CATEGORY_COLORS = ["var(--chart-5)", "var(--chart-4)"];

export function ExpenseChartCards({ charts }: ExpenseChartCardsProps) {
  const categoryRows = charts.byCategory;
  const monthRows = charts.byMonth;
  const hasCategoryTotals = categoryRows.some((row) => row.total > 0);
  const hasMonthlyAmounts = monthRows.some((row) => row.amount > 0);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Egresos por categoría</CardTitle>
          <CardDescription>En qué se va el dinero, por tipo de egreso.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasCategoryTotals ? (
            <EmptyChart label="Sin egresos para graficar." />
          ) : (
            <ChartFrame className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={(props) => <ChartTooltip {...props} valueLabel="Total" />}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {categoryRows.map((_, index) => (
                      <Cell key={index} fill={EXPENSE_CATEGORY_COLORS[index % EXPENSE_CATEGORY_COLORS.length]} />
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
          <CardTitle>Egresos por mes</CardTitle>
          <CardDescription>Total de egresos de cada mes.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasMonthlyAmounts ? (
            <EmptyChart label="Sin egresos en los ultimos meses." />
          ) : (
            <ChartFrame className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={(props) => <ChartTooltip {...props} valueLabel="Monto" />}
                  />
                  <Bar dataKey="amount" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
