/**
 * Shared nav link definitions for the `(dashboard)` route group's shell
 * (`app/(dashboard)/layout.tsx`), per `docs/ui-ux-flow.md`'s "Navegacion
 * principal" section: Dashboard, Clientes, Facturas, Pagos, Negocio.
 *
 * A single source of truth used by both the desktop sidebar and the mobile
 * bottom nav, so the two never drift out of sync. Each item carries its own
 * `icon` (a `lucide-react` component reference, not an element) so both
 * consumers render the same icon without keeping a second href-to-icon map
 * in sync by hand.
 */

import { CreditCard, FileText, LayoutDashboard, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/invoices", label: "Facturas", icon: FileText },
  { href: "/payments", label: "Pagos", icon: CreditCard },
  { href: "/settings", label: "Negocio", icon: Settings },
];
