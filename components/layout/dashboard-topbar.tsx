/**
 * Slim top bar, visible at every breakpoint, so logout is always reachable
 * regardless of which nav (sidebar vs. bottom nav) applies at the current
 * viewport. A plain (synchronous) Server Component — `session` is passed
 * down from `app/(dashboard)/layout.tsx`, which already resolves it via
 * `requireSession()`, rather than fetching it again here (see that file's
 * doc comment for why: an async component nested in JSX can't be
 * reconciled by React's client renderer, which `layout.test.tsx` uses).
 * `LogoutButton` (a Client Component) remains the only interactive piece.
 *
 * The section label is kept static rather than derived from the current
 * route: deriving it would require a client-side `usePathname()`, which
 * isn't worth it for a label that never actually changes copy across
 * screens in this app.
 */

import type { Session } from "@/lib/services/ports";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import LogoutButton from "./logout-button";

export default function DashboardTopbar({ session }: { session: Session }) {
  const initial = session.email.charAt(0).toUpperCase();

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
      <span className="text-sm font-semibold">Panel de negocio</span>
      <div className="flex items-center gap-3">
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
