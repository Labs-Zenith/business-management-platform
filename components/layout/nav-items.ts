/**
 * Shared nav link definitions for the `(dashboard)` route group's shell
 * (`app/(dashboard)/layout.tsx`), per `docs/ui-ux-flow.md`'s "Navegacion
 * principal" section: Dashboard, Clientes, Facturas, Pagos, Egresos, Nómina,
 * Inventario, Settings. Fase 5 Lane 4 removed the earlier "Negocio" item
 * (`/settings`) — the sidebar's business switcher briefly provided
 * Configuración/Editar perfil access instead — and added "Egresos"
 * (`/egresos`, a dedicated expense management page) next to the other
 * financial items. Fase 5.1 Lane B re-added `/settings` as a plain
 * "Settings" nav entry at the END of the list: the business switcher
 * (`business-switcher.tsx`) was rewritten into an inline "switch business"
 * `Collapsible` and no longer surfaces account-level links itself, so
 * Settings needs its own place in the nav like every other section.
 *
 * A single source of truth used by both the desktop sidebar and the mobile
 * nav drawer (`mobile-nav-sheet.tsx`, Fase 4 Lane C — replaces the removed
 * `dashboard-bottom-nav.tsx`), so the two never drift out of sync. Each item
 * carries its own `icon` (a `lucide-react` component reference, not an
 * element) so both consumers render the same icon without keeping a second
 * href-to-icon map in sync by hand.
 *
 * `capability` (optional) tags an item as role-gated, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`'s
 * "Navigation Items Are Filtered by Role" requirement — Nómina is the first
 * (and so far only) gated item. `navItemsForRole` is the single filtering
 * function both `dashboard-sidebar.tsx` and `mobile-nav-sheet.tsx`
 * consume, so a future gated item is one array entry, not a bespoke filter
 * in each consumer. This is a UX complement only — the authoritative check
 * is `lib/session.ts`'s `requireCapability`/`requireCapabilityOrNotFound` at
 * the page/route layer; hiding a nav item never substitutes for that.
 *
 * `Inventario` (per `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s
 * "No Role Gating on Inventory" requirement) is a plain entry with NO
 * `capability` tag — visible to every role via `navItemsForRole`'s
 * `!item.capability` short-circuit, unlike Nómina.
 *
 * `isActivePath` and `SIDEBAR_COLLAPSED_COOKIE` (review-fix pass, Fase 4 Lane
 * C) also live here rather than being copy-pasted per nav surface:
 * `isActivePath` was previously duplicated verbatim in both
 * `dashboard-sidebar.tsx` and `mobile-nav-sheet.tsx`, and the cookie name was
 * declared twice under two DIFFERENT identifiers with the same string value
 * (`dashboard-sidebar.tsx`'s `COLLAPSED_COOKIE_NAME` and
 * `app/(dashboard)/layout.tsx`'s `SIDEBAR_COLLAPSED_COOKIE_NAME`) — a rename
 * of either in isolation would silently break cookie persistence. Both are
 * now single-sourced here alongside `NAV_ITEMS`/`navItemsForRole`.
 */

import { Banknote, CreditCard, FileText, LayoutDashboard, Package, Receipt, Settings, Users, type LucideIcon } from "lucide-react";
import { can, type Capability } from "@/lib/services/permissions";
import type { Role } from "@/lib/services/ports";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/invoices", label: "Facturas", icon: FileText },
  { href: "/payments", label: "Pagos", icon: CreditCard },
  { href: "/egresos", label: "Egresos", icon: Receipt },
  { href: "/nomina", label: "Nómina", icon: Banknote, capability: "viewPayroll" },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Filters `NAV_ITEMS` down to those `role` may see (deny-by-default, via `can()`). */
export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.capability || can(role, item.capability));
}

/**
 * True when `pathname` is `href` itself or a sub-path of it (e.g.
 * `/customers/123` is active for the `/customers` nav item). Shared by
 * `dashboard-sidebar.tsx` and `mobile-nav-sheet.tsx` via `nav-link.tsx` so
 * the two surfaces' active-state logic never drifts apart.
 */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The `sidebar_collapsed` cookie name, single-sourced for both the
 * server-side read (`app/(dashboard)/layout.tsx`) and the client-side write
 * (`dashboard-sidebar.tsx`) of the desktop sidebar's collapsed/expanded
 * choice.
 */
export const SIDEBAR_COLLAPSED_COOKIE = "sidebar_collapsed";
