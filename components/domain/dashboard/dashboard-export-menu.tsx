import { ExportMenu } from "@/components/domain/export-menu";

/**
 * Thin wrapper over the shared `ExportMenu` (`components/domain/export-menu.tsx`)
 * — the same flat two-item Excel/PDF menu every other list page uses.
 *
 * This used to be its own nested month → format menu, back when the screen
 * itself was fixed to a rolling 30-day window and the export was the ONLY
 * place a calendar month could be chosen. Now that `PeriodMenu` owns the
 * month choice in the header, exporting simply follows what is already on
 * screen — offering the month list a second time, in a second menu, in the
 * same header would be the same list twice.
 */
export function DashboardExportMenu({ period }: { period: string }) {
  return <ExportMenu path="/api/dashboard/export" params={{ period }} />;
}
