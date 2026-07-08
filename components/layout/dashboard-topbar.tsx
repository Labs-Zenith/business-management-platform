/**
 * Slim top bar, visible at every breakpoint, so logout is always reachable
 * regardless of which nav (sidebar vs. bottom nav) applies at the current
 * viewport. A plain Server Component — no hooks needed here, only
 * `LogoutButton` (a Client Component) is interactive.
 */

import LogoutButton from "./logout-button";

export default function DashboardTopbar() {
  return (
    <header className="flex items-center justify-between border-b border-border p-4">
      <span className="text-sm font-semibold">Panel de negocio</span>
      <LogoutButton />
    </header>
  );
}
