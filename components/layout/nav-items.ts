/**
 * Shared nav link definitions for the `(dashboard)` route group's shell
 * (`app/(dashboard)/layout.tsx`), per `docs/ui-ux-flow.md`'s "Navegacion
 * principal" section: Dashboard, Clientes, Facturas, Ingresos, Egresos, Nómina,
 * Inventario, Settings. Fase 5 Lane 4 removed the earlier "Negocio" item
 * (`/settings`) — the sidebar's business switcher briefly provided
 * Configuración/Editar perfil access instead — and added "Egresos"
 * (`/egresos`, a dedicated expense management page) next to the other
 * financial items. Fase 5.1 Lane B re-added `/settings` as a plain
 * "Settings" nav entry at the END of the list: the business switcher
 * (`business-switcher.tsx`) was rewritten into an inline "switch business"
 * `Collapsible` and no longer surfaces account-level links itself, so
 * Settings needs its own place in the nav like every other section. Fase
 * 5.2 F3 renamed the label to "Configuración" (Spanish, matching the rest
 * of the nav's labels) — the `href`/`icon` are unchanged.
 *
 * A single source of truth used by both the desktop sidebar and the mobile
 * nav drawer (`mobile-nav-sheet.tsx`, Fase 4 Lane C — replaces the removed
 * `dashboard-bottom-nav.tsx`), so the two never drift out of sync. Each item
 * carries its own `icon` (a `lucide-react` component reference, not an
 * element) so both consumers render the same icon without keeping a second
 * href-to-icon map in sync by hand.
 *
 * WHICH items a session sees is decided **entirely in the backend** by the
 * SERVER-only `resolveVisibleNavIds(role, enabledFeatures)` (called once in
 * `app/(dashboard)/layout.tsx`, after that layout resolves `enabledFeatures`
 * itself via `lib/services/features.ts#listEnabledFeatures`, a DB read): it
 * applies BOTH the role `capability` gate and the per-business `feature`
 * gate, and returns the ordered `NavItemId[]`. That id list (plain,
 * serializable strings) is threaded down to the client nav surfaces, which
 * render from `NAV_ITEMS_BY_ID` — the client runs NO gating logic of its own
 * (this is why there's no SSR→hydration flicker). THIS FILE deliberately
 * takes the resolved `enabledFeatures` set as a plain argument rather than
 * importing `lib/services/features.ts`/`repositories.ts` itself — it is also
 * imported by client components, so it must stay free of any DB/repositories
 * import.
 *
 * `capability` (optional) tags an item as role-gated (Nómina, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`).
 * `Inventario` has NO `capability` — visible to every role. `feature`
 * (optional) tags an item as gated by a per-BUSINESS entitlement (the
 * `business_features` DB table, `lib/services/features.ts`) — "Ventas" (the
 * sales pipeline board), enabled only for businesses with a `pipeline` row.
 * Both are a UX complement only: the authoritative checks are
 * `lib/session.ts`'s `requireCapability`/`requireCapabilityOrNotFound` and
 * each gated page's own `notFound()`/API `403` — hiding a nav item never
 * substitutes for those.
 *
 * `isActivePath` and `SIDEBAR_COLLAPSED_COOKIE` (review-fix pass, Fase 4 Lane
 * C) also live here rather than being copy-pasted per nav surface:
 * `isActivePath` was previously duplicated verbatim in both
 * `dashboard-sidebar.tsx` and `mobile-nav-sheet.tsx`, and the cookie name was
 * declared twice under two DIFFERENT identifiers with the same string value
 * (`dashboard-sidebar.tsx`'s `COLLAPSED_COOKIE_NAME` and
 * `app/(dashboard)/layout.tsx`'s `SIDEBAR_COLLAPSED_COOKIE_NAME`) — a rename
 * of either in isolation would silently break cookie persistence. Both are
 * now single-sourced here alongside `NAV_ITEMS`/`resolveVisibleNavIds`.
 */

import { Banknote, BookOpen, CreditCard, FileText, Kanban, LayoutDashboard, Package, Receipt, Settings, Users, type LucideIcon } from "lucide-react";
import { can, type Capability } from "@/lib/services/permissions";
import type { Feature, Role } from "@/lib/services/ports";

/** Stable id per nav item — the serializable token the server sends to the client (see `resolveVisibleNavIds`/`NAV_ITEMS_BY_ID`). */
export type NavItemId =
  | "dashboard"
  | "customers"
  | "invoices"
  | "ventas"
  | "payments"
  | "egresos"
  | "nomina"
  | "inventario"
  | "catalogo"
  | "settings";

export type NavItem = {
  id: NavItemId;
  href: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
  feature?: Feature;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", href: "/customers", label: "Clientes", icon: Users },
  { id: "invoices", href: "/invoices", label: "Facturas", icon: FileText },
  { id: "ventas", href: "/ventas", label: "Ventas", icon: Kanban, feature: "pipeline" },
  { id: "payments", href: "/payments", label: "Ingresos", icon: CreditCard },
  { id: "egresos", href: "/egresos", label: "Egresos", icon: Receipt },
  { id: "nomina", href: "/nomina", label: "Nómina", icon: Banknote, capability: "viewPayroll" },
  { id: "inventario", href: "/inventario", label: "Inventario", icon: Package },
  // Next to Inventario because both answer "what do we sell?" — but they are
  // different answers: Inventario tracks stock of physical goods, Catálogo is
  // the price book (mostly services), which has no stock at all.
  { id: "catalogo", href: "/catalogo", label: "Catálogo", icon: BookOpen, feature: "catalog" },
  { id: "settings", href: "/settings", label: "Configuración", icon: Settings },
];

/**
 * Client-safe lookup: `id → NavItem` (icon included). The SERVER decides which
 * ids are visible (`resolveVisibleNavIds`) and sends only the ids (plain,
 * serializable strings); the CLIENT resolves each id's `icon`/`label`/`href`
 * here. This is what keeps the gating decision entirely in the backend while
 * respecting that `icon` (a component) can't cross the RSC → Client boundary.
 */
export const NAV_ITEMS_BY_ID: Record<NavItemId, NavItem> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, item]),
) as Record<NavItemId, NavItem>;

/**
 * SERVER-ONLY (by convention, not by import — see this file's module doc
 * comment), single source of truth for WHICH nav items a session sees:
 * applies the role `capability` gate (`can()`) AND the per-business `feature`
 * gate against the already-resolved `enabledFeatures` set. This file stays
 * free of any DB/repositories import (it's also imported by client
 * components) — the caller (`app/(dashboard)/layout.tsx`) does the async DB
 * read via `lib/services/features.ts#listEnabledFeatures` and passes the
 * result in as a plain argument. Returns the ORDERED `NavItemId[]`; the
 * client renders from `NAV_ITEMS_BY_ID`. Sending the computed id list (plain
 * strings) — never the raw `NavItem`s (whose `icon` is a non-serializable
 * component) — is what puts the whole gating decision in the backend and
 * eliminates any client-side flicker. Still a UX complement only: the page's
 * own `notFound()` and the API's `403` remain the authority.
 */
export function resolveVisibleNavIds(role: Role, enabledFeatures: ReadonlySet<Feature>): NavItemId[] {
  return NAV_ITEMS.filter(
    (item) =>
      (!item.capability || can(role, item.capability)) &&
      (!item.feature || enabledFeatures.has(item.feature)),
  ).map((item) => item.id);
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
