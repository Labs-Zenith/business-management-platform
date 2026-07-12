import type { ReactNode } from "react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { repositories } from "@/lib/services/repositories";
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
 * `requireSessionOrRedirect()` runs here too (defense in depth alongside
 * `middleware.ts`'s route guard on every `(dashboard)` path), matching the
 * pattern every page in this project already follows individually
 * (`settings/page.tsx`, `customers/page.tsx`, etc. — see
 * `docs/security-plan.md`). This is an ADDITIONAL belt-and-suspenders layer,
 * not a replacement for each page's own `requireSessionOrRedirect()` call.
 * A stale/invalid session cookie (e.g. pre-role-migration shape) redirects
 * to `/login` here rather than crashing — this layout has no
 * `error.tsx`/`global-error.tsx` boundary, so a thrown error would otherwise
 * be Next's generic crash page for every currently-logged-in user.
 *
 * The resolved `session` is passed down to `DashboardTopbar` (which needs
 * `session.email` for its avatar initial) as a prop rather than having it
 * call `requireSessionOrRedirect()` a second time — that would also make it an async
 * Server Component nested inside JSX, which React's client renderer (used
 * by `layout.test.tsx`'s `render()`) cannot reconcile. For the same reason,
 * this layout also resolves the session's full list of business
 * memberships via `repositories.business.listMembershipsForUser(session.userId)`
 * (Phase 7, `roles-multi-business`) and passes it down as `memberships`, so
 * `DashboardTopbar`'s `BusinessSwitcher` can render without doing any
 * fetching of its own.
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
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  // NOTE: unlike `requireSessionOrRedirect()` above, this call has no
  // try/catch — a rejection here currently crashes this dashboard shell
  // (same class of issue PR1 fixed for session resolution). Graceful
  // degradation (e.g. falling back to an empty `memberships` list) is a
  // possible future improvement, not implemented here.
  const memberships = await repositories.business.listMembershipsForUser(session.userId);

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <DashboardTopbar session={session} memberships={memberships} />
      <div className="flex min-w-0 flex-1">
        <DashboardSidebar />
        <main className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">{children}</main>
      </div>
      <DashboardBottomNav />
    </div>
  );
}
