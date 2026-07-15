import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireSessionOrRedirect, getSavedAccounts } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { repositories } from "@/lib/services/repositories";
import DashboardTopbar from "@/components/layout/dashboard-topbar";
import DashboardSidebar from "@/components/layout/dashboard-sidebar";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/components/layout/nav-items";

/**
 * Shared navigation shell for every `(dashboard)` route-group screen
 * (dashboard, customers, customers/[id], invoices, invoices/new,
 * invoices/[id], payments, settings), per `docs/ui-ux-flow.md`'s
 * "Navegacion principal" section: a persistent sidebar on desktop
 * ("Sidebar o navegacion lateral") and a hamburger-triggered nav drawer on
 * mobile (Fase 4 Lane C — replaces the earlier "Navegacion inferior o menu
 * compacto" bottom nav), both linking to Dashboard, Clientes, Facturas,
 * Pagos, and Negocio, plus a logout action always reachable from the top
 * bar regardless of viewport.
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
 * The resolved `session` is passed down to `DashboardTopbar` as a prop
 * rather than having it call `requireSessionOrRedirect()` a second time —
 * that would also make it an async Server Component nested inside JSX,
 * which React's client renderer (used by `layout.test.tsx`'s `render()`)
 * cannot reconcile. For the same reason, this layout also resolves the
 * session's full list of business memberships via
 * `repositories.business.listMembershipsForUser(session.userId)` (Phase 7,
 * `roles-multi-business`) and passes it (plus `session.businessId` as
 * `currentBusinessId`) down to BOTH `DashboardSidebar` (desktop) and
 * `DashboardTopbar` (which threads it into `MobileNavSheet`'s drawer) —
 * Fase 5.1 Lane B renders the SAME `sidebar-content.tsx` composition
 * (business switcher, nav, bottom user row) on both surfaces, so both need
 * the same data. `session.email` is threaded the same way, to each
 * surface's `SidebarUserMenu` (the bottom-of-sidebar/drawer logout row that
 * replaced the old topbar `UserMenu`).
 *
 * `DashboardSidebar`'s collapse state (Fase 4 Lane C) is read here from the
 * `SIDEBAR_COLLAPSED_COOKIE` cookie (single-sourced in `nav-items.ts` —
 * review-fix pass, so this name and `dashboard-sidebar.tsx`'s client-side
 * write of the same cookie can never drift apart) via `next/headers`'s
 * `cookies()`, and passed down as `defaultCollapsed` — the standard shadcn
 * "cookie-backed sidebar" pattern. Doing this server-side (rather than a
 * client-only `useState`) avoids a hydration flash: without it, a user who
 * last collapsed the sidebar would see it flash open for one frame on every
 * reload before the client-side toggle state caught up.
 *
 * Existing page content is untouched: each `page.tsx` keeps its own
 * `flex flex-1 flex-col p-4` wrapper unchanged; this layout only adds
 * shared chrome around it.
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
  const savedAccounts = await getSavedAccounts();
  const cookieStore = await cookies();
  const sidebarDefaultCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "true";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <DashboardTopbar session={session} memberships={memberships} savedAccounts={savedAccounts} />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/*
          `role` (a plain string, not a pre-filtered `NavItem[]`) is the only
          nav-shaping value threaded across the server/client boundary here.
          Each Client Component below calls `navItemsForRole(role)` itself
          (see `nav-items.ts`) so a `worker` session never sees a
          capability-gated item (e.g. Nómina) in either surface, without
          ever passing an icon-bearing object through a Server Component
          prop — this Next.js build's stricter RSC serialization rejects
          function/class-bearing props ("Only plain objects can be passed
          to Client Components…"). This is a UX complement only; the
          authoritative check is each gated page's/route's own
          `requireCapabilityOrNotFound`/`requireCapability` call.
          `DashboardTopbar` renders `MobileNavSheet` internally (also
          `role`-filtered) for the mobile drawer. `DashboardSidebar` also
          takes `currentBusinessId`/`memberships` for its `BusinessSwitcher`
          (Fase 5 Lane 1 — moved here from the topbar).
        */}
        <DashboardSidebar
          role={session.role}
          currentBusinessId={session.businessId}
          memberships={memberships}
          savedAccounts={savedAccounts}
          email={session.email}
          defaultCollapsed={sidebarDefaultCollapsed}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
