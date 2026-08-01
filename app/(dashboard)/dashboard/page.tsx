import { Suspense } from "react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { parsePeriodParam } from "@/lib/services/dashboard-period";
import { getPeriodOptions } from "@/lib/services/dashboard-period-options";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { DashboardTabs } from "@/components/domain/dashboard/dashboard-tabs";
import { PeriodMenu } from "@/components/domain/dashboard/period-menu";
import { DashboardExportMenu } from "@/components/domain/dashboard/dashboard-export-menu";
import { KpiCards, KpiCardsSkeleton } from "@/components/domain/dashboard/kpi-cards";
import { DashboardCharts, DashboardChartsSkeleton } from "@/components/domain/dashboard/dashboard-charts";
import { OverdueList, OverdueListSkeleton } from "@/components/domain/dashboard/overdue-list";
import { TopDebtors, TopDebtorsSkeleton } from "@/components/domain/dashboard/top-debtors";
import { RecentPayments, RecentPaymentsSkeleton } from "@/components/domain/dashboard/recent-payments";
import { ExpenseKpiCards, ExpenseKpiCardsSkeleton } from "@/components/domain/dashboard/expense-kpi-cards";
import { ExpenseCharts, ExpenseChartsSkeleton } from "@/components/domain/dashboard/expense-charts";
import { RecentExpenses, RecentExpensesSkeleton } from "@/components/domain/dashboard/recent-expenses";

/**
 * The `<form>` both `PeriodMenu`'s period buttons and `DashboardTabs`' hidden
 * `tab` input submit through (`form={FILTER_FORM_ID}` on each) — see their
 * own doc comments for why this is a GET form submit rather than a `<Link
 * href="?period=...">`. Declared once here so both stay in sync with the
 * form they actually target.
 */
const FILTER_FORM_ID = "dashboard-filters";

const TAB_VALUES = ["ingresos", "egresos"] as const;
type DashboardTab = (typeof TAB_VALUES)[number];

/** Unknown/absent `?tab=` resolves to Ingresos — mirrors `parsePeriodParam`'s never-throw posture for a bad query string. */
function parseTabParam(raw: string | undefined): DashboardTab {
  return (TAB_VALUES as readonly string[]).includes(raw ?? "") ? (raw as DashboardTab) : "ingresos";
}

/**
 * Dashboard screen, per `docs/ui-ux-flow.md`'s "Dashboard" section.
 *
 * ONE `<Tabs>`, no section headings. An earlier version split this screen
 * into "Cobros pendientes" (point-in-time) and "Últimos 30 días"
 * (period-scoped) `<section>`s, each with its own heading — that split
 * existed only because mixing a "right now" figure with a "this period"
 * figure in one row read as inconsistent. `StatCard`'s `hint` fixes that at
 * the card level (each figure states "hoy" or the period label right under
 * its number), so the screen-level split is no longer needed, and the
 * Ingresos/Egresos tabs go back to owning the whole page.
 *
 * PERIOD SELECTOR, in the header. The previous fixed-30-day version removed
 * a period control because it used to govern only half the page — that
 * problem no longer exists once there is only one section, so the control
 * comes back, and now every figure and both charts move together with it.
 * `parsePeriodParam(params.period)` resolves it (defaulting to the last 30
 * days), and `getPeriodOptions(session)` supplies the menu's data-driven
 * month list — awaited here, ahead of all streaming, same as the export
 * menu's month list always was.
 *
 * The period and tab controls are both plain GET form submits through the
 * empty `<form id={FILTER_FORM_ID}>` below, not links: see
 * `period-menu.tsx`'s and `dashboard-tabs.tsx`'s doc comments for the
 * Portal/hidden-input mechanics that make a period pick carry whichever tab
 * is actually on screen.
 *
 * Each panel streams independently: one async Server Component per
 * `<Suspense>` boundary, each calling only the services it renders, so a
 * slow section never blocks the others. `keepMounted` on both `TabsPanel`s
 * keeps the inactive tab's server-streamed content from being discarded and
 * re-fetched on every switch.
 *
 * `requireSessionOrRedirect`, never `requireSession`: there is no
 * `error.tsx` here, so a missing session must redirect rather than crash —
 * see `lib/session.ts`.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tab?: string }>;
}) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;

  const period = parsePeriodParam(params.period);
  const activeTab = parseTabParam(params.tab);
  const periodOptions = await getPeriodOptions(session);

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Revisa lo que te deben y cómo va tu negocio."
        actions={
          <>
            <PeriodMenu
              period={period}
              presets={periodOptions.presets}
              months={periodOptions.months}
              formId={FILTER_FORM_ID}
            />
            <DashboardExportMenu period={period.key} />
          </>
        }
      />

      {/* Empty on purpose: it exists only as the GET submit target for
          `PeriodMenu`'s period buttons and `DashboardTabs`' hidden `tab`
          input (both associate via `form={FILTER_FORM_ID}`, not DOM
          nesting) — it carries no visible fields of its own. */}
      <form id={FILTER_FORM_ID} method="get" />

      <DashboardTabs defaultValue={activeTab} formId={FILTER_FORM_ID}>
        <TabsList>
          <TabsTab value="ingresos">Ingresos</TabsTab>
          <TabsTab value="egresos">Egresos</TabsTab>
        </TabsList>

        {/* keepMounted is required: do not remove. base-ui's default is
            `false`, which would unmount this panel's server-streamed
            subtree (and re-fetch it) whenever the Egresos tab is active. */}
        <TabsPanel value="ingresos" keepMounted>
          <Suspense fallback={<KpiCardsSkeleton />}>
            <KpiCards period={period} />
          </Suspense>

          <Suspense fallback={<DashboardChartsSkeleton />}>
            <DashboardCharts period={period} />
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
            <RecentPayments period={period} />
          </Suspense>
        </TabsPanel>

        {/* keepMounted is required: do not remove. See the note above. */}
        <TabsPanel value="egresos" keepMounted>
          <Suspense fallback={<ExpenseKpiCardsSkeleton />}>
            <ExpenseKpiCards period={period} />
          </Suspense>

          <Suspense fallback={<ExpenseChartsSkeleton />}>
            <ExpenseCharts period={period} />
          </Suspense>

          <Suspense fallback={<RecentExpensesSkeleton />}>
            <RecentExpenses period={period} />
          </Suspense>
        </TabsPanel>
      </DashboardTabs>
    </PageShell>
  );
}
