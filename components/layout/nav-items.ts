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
 * SERVER-only `resolveVisibleNavIds(role, businessId)` (called once in
 * `app/(dashboard)/layout.tsx`): it applies BOTH the role `capability` gate
 * and the per-business `feature` gate, and returns the ordered `NavItemId[]`.
 * That id list (plain, serializable strings) is threaded down to the client
 * nav surfaces, which render from `NAV_ITEMS_BY_ID` — the client runs NO
 * gating logic of its own (this is why there's no SSR→hydration flicker: the
 * `feature` env var is server-only and never read on the client).
 *
 * `capability` (optional) tags an item as role-gated (Nómina, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`).
 * `Inventario` has NO `capability` — visible to every role. `feature`
 * (optional) tags an item as gated by a per-BUSINESS flag
 * (`lib/services/features.ts`) — "Ventas" (the sales pipeline board), enabled
 * only for businesses in the `PIPELINE_ENABLED_BUSINESS_IDS` allowlist. Both
 * are a UX complement only: the authoritative checks are `lib/session.ts`'s
 * `requireCapability`/`requireCapabilityOrNotFound` and each gated page's own
 * `notFound()`/API `403` — hiding a nav item never substitutes for those.
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

import { Banknote, CreditCard, FileText, Kanban, LayoutDashboard, Package, Receipt, Settings, Users, type LucideIcon } from "lucide-react";
import { can, type Capability } from "@/lib/services/permissions";
import { isPipelineEnabled } from "@/lib/services/features";
import type { Role } from "@/lib/services/ports";

/** The only per-business feature flags a nav item can be tagged with today — see this file's `feature` doc comment above. */
export type NavFeature = "pipeline";

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
  | "settings";

export type NavItem = {
  id: NavItemId;
  href: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
  feature?: NavFeature;
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

/** Single dispatch point for whether a per-business `NavFeature` is enabled. */
function isNavFeatureEnabled(feature: NavFeature, businessId: string): boolean {
  switch (feature) {
    case "pipeline":
      return isPipelineEnabled(businessId);
  }
}

/**
 * SERVER-ONLY, single source of truth for WHICH nav items a session sees:
 * applies the role `capability` gate (`can()`) AND the per-business `feature`
 * gate (`isNavFeatureEnabled` → `isPipelineEnabled`, which reads a
 * NON-`NEXT_PUBLIC_` env var absent from the browser bundle — so this MUST run
 * server-side, e.g. in `app/(dashboard)/layout.tsx`). Returns the ORDERED
 * `NavItemId[]`; the client renders from `NAV_ITEMS_BY_ID`. Sending the
 * computed id list (plain strings) — never the raw `NavItem`s (whose `icon` is
 * a non-serializable component) — is what puts the whole gating decision in
 * the backend and eliminates any client-side flicker. Still a UX complement
 * only: the page's own `notFound()` and the API's `403` remain the authority.
 */
export function resolveVisibleNavIds(role: Role, businessId: string): NavItemId[] {
  return NAV_ITEMS.filter(
    (item) =>
      (!item.capability || can(role, item.capability)) &&
      (!item.feature || isNavFeatureEnabled(item.feature, businessId)),
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
