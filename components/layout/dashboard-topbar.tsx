/**
 * Mobile-only top bar. A plain (synchronous) Server Component —
 * `session`/`memberships` are passed down from `app/(dashboard)/layout.tsx`,
 * which already resolves them, rather than fetching them again here (see
 * that file's doc comment for why: an async component nested in JSX can't
 * be reconciled by React's client renderer, which `layout.test.tsx` uses).
 * `MobileNavSheet` (a Client Component) remains the only interactive piece.
 *
 * Fase 5.1 Lane B: the user menu (logout) moved OUT of this topbar entirely
 * — it now lives at the bottom of the sidebar/drawer chrome as
 * `sidebar-user-menu.tsx`, rendered by `sidebar-content.tsx`.
 *
 * The static "Panel de negocio" section label was removed — on desktop,
 * `DashboardSidebar` already provides navigation context, so this bar's only
 * remaining purpose is hosting the mobile hamburger nav trigger
 * (`MobileNavSheet`, whose own trigger is `md:hidden` internally). The
 * `<header>` itself now carries `md:hidden` too, so the bar disappears
 * entirely on desktop instead of rendering as an empty strip.
 *
 * `MobileNavSheet` (Fase 4 Lane C — replaces the removed
 * `dashboard-bottom-nav.tsx`; Fase 5.1 Lane B — now also renders the full
 * sidebar chrome, so it needs `currentBusinessId`/`memberships`/`email` in
 * addition to `role`) needs `session.role` to filter its nav list via
 * `navItemsForRole`, the same plain-string prop `DashboardSidebar` already
 * takes for the same RSC-serialization reason (see that file's doc
 * comment).
 */

import type { BusinessMembership, SavedAccount, Session } from "@/lib/services/ports";
import MobileNavSheet from "./mobile-nav-sheet";

export default function DashboardTopbar({
  session,
  memberships,
  savedAccounts,
}: {
  session: Session;
  memberships: BusinessMembership[];
  savedAccounts?: SavedAccount[];
}) {
  return (
    <header className="flex shrink-0 items-center border-b border-border bg-background px-4 py-3 md:hidden">
      <MobileNavSheet
        role={session.role}
        currentBusinessId={session.businessId}
        memberships={memberships}
        savedAccounts={savedAccounts}
        email={session.email}
      />
    </header>
  );
}
