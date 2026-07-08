/**
 * Shared nav link definitions for the `(dashboard)` route group's shell
 * (`app/(dashboard)/layout.tsx`), per `docs/ui-ux-flow.md`'s "Navegacion
 * principal" section: Dashboard, Clientes, Facturas, Pagos, Negocio.
 *
 * A single source of truth used by both the desktop sidebar and the mobile
 * bottom nav, so the two never drift out of sync.
 */

export type NavItem = {
  href: string;
  label: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Clientes" },
  { href: "/invoices", label: "Facturas" },
  { href: "/payments", label: "Pagos" },
  { href: "/settings", label: "Negocio" },
];
