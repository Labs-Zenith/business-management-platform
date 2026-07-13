import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { DashboardExportMenu } from "@/components/domain/dashboard/dashboard-export-menu";
import { KpiCards, KpiCardsSkeleton } from "@/components/domain/dashboard/kpi-cards";
import { RecentPayments, RecentPaymentsSkeleton } from "@/components/domain/dashboard/recent-payments";
import { TopDebtors, TopDebtorsSkeleton } from "@/components/domain/dashboard/top-debtors";
import { OverdueList, OverdueListSkeleton } from "@/components/domain/dashboard/overdue-list";
import { DashboardCharts, DashboardChartsSkeleton } from "@/components/domain/dashboard/dashboard-charts";
import { ExpenseKpiCards, ExpenseKpiCardsSkeleton } from "@/components/domain/dashboard/expense-kpi-cards";
import { ExpenseCharts, ExpenseChartsSkeleton } from "@/components/domain/dashboard/expense-charts";
import { RecentExpenses, RecentExpensesSkeleton } from "@/components/domain/dashboard/recent-expenses";
import CustomerFormDialog from "@/components/domain/customers/customer-form-dialog";
import ExpenseFormDialog from "@/components/domain/dashboard/expense-form-dialog";

/**
 * Dashboard screen, per `docs/ui-ux-flow.md`'s "Dashboard" section
 * ("Total pendiente por cobrar", "Pagos del mes", "Facturas vencidas",
 * "Pagos recientes", "Clientes con mayor saldo", plus "Crear cliente"/
 * "Crear factura" quick actions) and
 * `openspec/changes/expenses-dashboard-split/specs/dashboard/spec.md`'s
 * "Dashboard Screen Content and Actions" requirement, which splits the
 * screen into an **Ingresos** tab (unchanged content below) and an
 * **Egresos** tab (expenses).
 *
 * This page stays a plain Server Component (no `"use client"`). It renders
 * the client `<Tabs>` shell (`components/ui/tabs.tsx`) and passes the
 * Ingresos/Egresos subtrees as `children` — those subtrees are still
 * Server Components, rendered and streamed on the server; the client Tabs
 * wrapper only positions already-rendered output and toggles visibility.
 * `keepMounted` is set on BOTH `TabsPanel`s so both subtrees render and
 * stream on initial load (eager-fetch both tabs) and switching tabs never
 * discards or re-fetches the inactive panel's content — see design.md
 * section 6 for the full mechanic.
 *
 * Each KPI/list section (Ingresos and Egresos alike) is rendered by its own
 * independently-streamed section — a standalone async Server Component
 * wrapped in its own `<Suspense>` boundary — so a slow section never blocks
 * the others from appearing. Every section calls its dashboard service
 * directly (never a single combined summary fetch, which would defeat
 * independent streaming).
 *
 * "Crear cliente" reuses the same lazy (`ssr:false`) dialog as
 * `app/(dashboard)/customers/page.tsx` (PR4) rather than linking away, for a
 * genuine one-click quick action; "Crear factura" links to the dedicated
 * `/invoices/new` page (a full line-item form, not a dialog). Both stay in
 * the page header as global/Ingresos-oriented actions; "Crear gasto" (Egresos
 * quick action) is tab-local — it lives inside the Egresos `TabsPanel` (see
 * design.md section 6), not the shared page header.
 *
 * "Exportar" exports the FULL dashboard (both tabs, all sections, no
 * filters), per `openspec/changes/dashboard-excel-export/design.md`. It is a
 * single trigger (`<DashboardExportMenu>`,
 * `components/domain/dashboard/dashboard-export-menu.tsx`) that opens a
 * dropdown to pick "Excel" or "PDF" — replacing the two separate export
 * buttons this page used to render directly. Both menu items are static
 * `<Link>`s built via `buildExportHref("/api/dashboard/export", {}, format)`
 * with an empty params object — unlike `invoices`/`payments`, the dashboard
 * export has no query-string filters to forward, so this page can stay a
 * non-async Server Component (no session/searchParams needed to build the
 * export hrefs).
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Claridad inmediata sobre tu cartera.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          <DashboardExportMenu />
          <CustomerFormDialog
            mode="create"
            trigger={
              <Button variant="outline" className="w-full sm:w-auto">
                Crear cliente
              </Button>
            }
          />
          <Button className="w-full sm:w-auto" nativeButton={false} render={<Link href="/invoices/new" />}>
            Crear factura
          </Button>
        </div>
      </div>

      <Tabs defaultValue="ingresos">
        <TabsList>
          <TabsTab value="ingresos">Ingresos</TabsTab>
          <TabsTab value="egresos">Egresos</TabsTab>
        </TabsList>

        {/* keepMounted is required: do not remove. base-ui's default is
            `false`, which would unmount this panel's server-streamed
            subtree (and re-fetch it) whenever the Egresos tab is active. */}
        <TabsPanel value="ingresos" keepMounted>
          <Suspense fallback={<KpiCardsSkeleton />}>
            <KpiCards />
          </Suspense>

          <Suspense fallback={<DashboardChartsSkeleton />}>
            <DashboardCharts />
          </Suspense>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Suspense fallback={<OverdueListSkeleton />}>
              <OverdueList />
            </Suspense>
            <Suspense fallback={<TopDebtorsSkeleton />}>
              <TopDebtors />
            </Suspense>
          </div>

          <Suspense fallback={<RecentPaymentsSkeleton />}>
            <RecentPayments />
          </Suspense>
        </TabsPanel>

        {/* keepMounted is required: do not remove. base-ui's default is
            `false`, which would unmount this panel's server-streamed
            subtree (and re-fetch it) whenever the Ingresos tab is active. */}
        <TabsPanel value="egresos" keepMounted>
          <div className="flex items-center justify-end">
            <ExpenseFormDialog trigger={<Button>Crear gasto</Button>} />
          </div>

          <Suspense fallback={<ExpenseKpiCardsSkeleton />}>
            <ExpenseKpiCards />
          </Suspense>

          <Suspense fallback={<ExpenseChartsSkeleton />}>
            <ExpenseCharts />
          </Suspense>

          <Suspense fallback={<RecentExpensesSkeleton />}>
            <RecentExpenses />
          </Suspense>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
