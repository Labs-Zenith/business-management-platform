import { ExportMenu } from "@/components/domain/export-menu";

/**
 * Thin dashboard-specific wrapper around the shared `ExportMenu`
 * (`components/domain/export-menu.tsx`). The dashboard export has no
 * query-string filters to forward, so `params` is always `{}`.
 *
 * Kept as a named export (not default) so `app/(dashboard)/dashboard/page.tsx`'s
 * existing `import { DashboardExportMenu } from ...` stays valid unchanged.
 */
export function DashboardExportMenu() {
  return <ExportMenu path="/api/dashboard/export" params={{}} />;
}
