import type { ReactNode } from "react";
import { requireSession } from "@/lib/session";
import DashboardTopbar from "@/components/layout/dashboard-topbar";
import DashboardSidebar from "@/components/layout/dashboard-sidebar";
import DashboardBottomNav from "@/components/layout/dashboard-bottom-nav";

/**
 * Shared navigation shell for every `(dashboard)` route-group screen
 * (dashboard, customers, customers/[id], invoices, invoices/new,
 * invoices/[id], payments, settings), per `docs/ui-ux-flow.md`'s
 * "Navegacion principal" section: a persistent sidebar on desktop
 * ("Sidebar o navegacion lateral") and a bottom nav on mobile
 * ("Navegacion inferior o menu compacto"), both linking to Dashboard,
 * Clientes, Facturas, Pagos, and Negocio, plus a logout action always
 * reachable from the top bar regardless of viewport.
 *
 * This closes a gap that PR2 through PR10 each individually deferred: until
 * now there was no way for a real user to click between sections or log out
 * from the UI — only direct URL navigation worked (`middleware.ts` still
 * guarded every path, but there was nothing to click).
 *
 * `requireSession()` runs here too (defense in depth alongside
 * `middleware.ts`'s route guard on every `(dashboard)` path), matching the
 * pattern every page in this project already follows individually
 * (`settings/page.tsx`, `customers/page.tsx`, etc. — see
 * `docs/security-plan.md`). This is an ADDITIONAL belt-and-suspenders layer,
 * not a replacement for each page's own `requireSession()` call.
 *
 * Existing page content is untouched: each `page.tsx` keeps its own
 * `flex flex-1 flex-col p-4` wrapper unchanged; this layout only adds
 * shared chrome around it, and reserves bottom padding on `<main>` on
 * mobile so the fixed bottom nav never overlaps page content.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <DashboardTopbar />
      <div className="flex min-w-0 flex-1">
        <DashboardSidebar />
        <main className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">{children}</main>
      </div>
      <DashboardBottomNav />
    </div>
  );
}
