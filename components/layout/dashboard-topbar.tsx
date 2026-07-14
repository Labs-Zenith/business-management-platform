/**
 * Slim top bar, visible at every breakpoint. A plain (synchronous) Server
 * Component — `session`/`memberships` are passed down from
 * `app/(dashboard)/layout.tsx`, which already resolves them, rather than
 * fetching them again here (see that file's doc comment for why: an async
 * component nested in JSX can't be reconciled by React's client renderer,
 * which `layout.test.tsx` uses). `MobileNavSheet` (a Client Component)
 * remains the only interactive piece.
 *
 * Fase 5.1 Lane B: the user menu (logout) moved OUT of this topbar entirely
 * — it now lives at the bottom of the sidebar/drawer chrome as
 * `sidebar-user-menu.tsx`, rendered by `sidebar-content.tsx`. This topbar no
 * longer has a right-hand side element, so the header switches from
 * `justify-between` to `justify-start` (the label sits directly after the
 * hamburger button instead of being pushed apart from a now-absent right
 * side).
 *
 * `MobileNavSheet` (Fase 4 Lane C — replaces the removed
 * `dashboard-bottom-nav.tsx`; Fase 5.1 Lane B — now also renders the full
 * sidebar chrome, so it needs `currentBusinessId`/`memberships`/`email` in
 * addition to `role`) needs `session.role` to filter its nav list via
 * `navItemsForRole`, the same plain-string prop `DashboardSidebar` already
 * takes for the same RSC-serialization reason (see that file's doc
 * comment) — its hamburger trigger is `md:hidden` internally, so it only
 * ever renders below the `md` breakpoint.
 *
 * The section label is kept static rather than derived from the current
 * route: deriving it would require a client-side `usePathname()`, which
 * isn't worth it for a label that never actually changes copy across
 * screens in this app.
 */

import type { BusinessMembership, Session } from "@/lib/services/ports";
import MobileNavSheet from "./mobile-nav-sheet";

export default function DashboardTopbar({
  session,
  memberships,
}: {
  session: Session;
  memberships: BusinessMembership[];
}) {
  return (
    <header className="flex shrink-0 items-center justify-start gap-2 border-b border-border bg-background px-4 py-3">
      <MobileNavSheet
        role={session.role}
        currentBusinessId={session.businessId}
        memberships={memberships}
        email={session.email}
      />
      <span className="text-sm font-semibold">Panel de negocio</span>
    </header>
  );
}
