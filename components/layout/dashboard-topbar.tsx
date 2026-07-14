/**
 * Slim top bar, visible at every breakpoint, so the user menu (and logout,
 * inside it) is always reachable regardless of which nav (sidebar vs.
 * mobile drawer) applies at the current viewport. A plain (synchronous)
 * Server Component — `session` is passed down from
 * `app/(dashboard)/layout.tsx`, which already resolves it via
 * `requireSessionOrRedirect()`, rather than fetching it again here (see
 * that file's doc comment for why: an async component nested in JSX can't
 * be reconciled by React's client renderer, which `layout.test.tsx` uses).
 * `UserMenu` and `MobileNavSheet` (both Client Components) remain the only
 * interactive pieces.
 *
 * `BusinessSwitcher` (Fase 5 Lane 1 — Vercel-style chrome) moved OUT of this
 * topbar and into the TOP of `dashboard-sidebar.tsx`; this component no
 * longer needs `memberships` at all.
 *
 * `MobileNavSheet` (Fase 4 Lane C — replaces the removed
 * `dashboard-bottom-nav.tsx`) needs `session.role` to filter its nav list
 * via `navItemsForRole`, the same plain-string prop `DashboardSidebar`
 * already takes for the same RSC-serialization reason (see that file's
 * doc comment) — its hamburger trigger is `md:hidden` internally, so it
 * only ever renders below the `md` breakpoint.
 *
 * The section label is kept static rather than derived from the current
 * route: deriving it would require a client-side `usePathname()`, which
 * isn't worth it for a label that never actually changes copy across
 * screens in this app.
 */

import type { Session } from "@/lib/services/ports";
import MobileNavSheet from "./mobile-nav-sheet";
import UserMenu from "./user-menu";

export default function DashboardTopbar({ session }: { session: Session }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
      <div className="flex items-center gap-2">
        <MobileNavSheet role={session.role} />
        <span className="text-sm font-semibold">Panel de negocio</span>
      </div>
      <UserMenu email={session.email} />
    </header>
  );
}
