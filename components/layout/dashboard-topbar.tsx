/**
 * Slim top bar, visible at every breakpoint, so logout is always reachable
 * regardless of which nav (sidebar vs. mobile drawer) applies at the
 * current viewport. A plain (synchronous) Server Component — `session` and
 * `memberships` are both passed down from `app/(dashboard)/layout.tsx`,
 * which already resolves them via `requireSessionOrRedirect()` and
 * `repositories.business.listMembershipsForUser()`, rather than fetching
 * them again here (see that file's doc comment for why: an async component
 * nested in JSX can't be reconciled by React's client renderer, which
 * `layout.test.tsx` uses). `LogoutButton`, `BusinessSwitcher`, and
 * `MobileNavSheet` (all Client Components) remain the only interactive
 * pieces.
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

import type { BusinessMembership, Session } from "@/lib/services/ports";
import { avatarInitial } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import BusinessSwitcher from "./business-switcher";
import LogoutButton from "./logout-button";
import MobileNavSheet from "./mobile-nav-sheet";

export default function DashboardTopbar({
  session,
  memberships,
}: {
  session: Session;
  memberships: BusinessMembership[];
}) {
  const initial = avatarInitial(session.email);

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
      <div className="flex items-center gap-2">
        <MobileNavSheet role={session.role} />
        <span className="text-sm font-semibold">Panel de negocio</span>
      </div>
      <div className="flex items-center gap-3">
        <BusinessSwitcher currentBusinessId={session.businessId} memberships={memberships} />
        <Avatar size="sm">
          <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        <LogoutButton />
      </div>
    </header>
  );
}
