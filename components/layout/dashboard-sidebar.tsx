"use client";

/**
 * Desktop nav ("Sidebar o navegacion lateral" per `docs/ui-ux-flow.md`'s
 * "En escritorio" section), visible at `md` and up. Mobile uses
 * `mobile-nav-sheet.tsx` instead (Fase 4 Lane C — replaces the removed
 * `dashboard-bottom-nav.tsx`) — both read from the same `NAV_ITEMS` source
 * of truth.
 *
 * Uses the `--sidebar*` token family from `app/globals.css` (not the
 * generic `--card`/`--accent` tokens) so the sidebar can read as a
 * distinct panel from the main content area, matching the dark
 * "sidebar + content" shell this was restyled after.
 *
 * Vercel-style chrome (Fase 5 Lane 1): the TOP of the sidebar now holds the
 * `BusinessSwitcher` (business avatar + name, replacing the previous static
 * "Negocio"+`Wallet` brand block) and the collapse toggle button, side by
 * side — both moved from their previous locations (`BusinessSwitcher` used
 * to live in `dashboard-topbar.tsx`; the toggle used to sit at the bottom,
 * `mt-auto`). `BusinessSwitcher` needs `memberships`/`currentBusinessId`,
 * threaded down from `app/(dashboard)/layout.tsx` the same way `role` is —
 * see this component's other doc comment below for why a Server Component
 * can't pass `NAV_ITEMS` directly.
 *
 * Collapse toggle (Fase 4 Lane C): `defaultCollapsed` is read server-side
 * from the `sidebar_collapsed` cookie by `app/(dashboard)/layout.tsx` and
 * passed down as this component's initial React state — this avoids a
 * hydration flash (a client-only `useState(false)` would render expanded
 * for one frame even when the user last chose collapsed). The toggle
 * button then flips local state AND persists the choice via
 * `document.cookie` (standard shadcn "cookie-backed sidebar" pattern),
 * so a reload restores it without any additional client-side fetch.
 * Collapsed items keep their filtered `navItemsForRole(role)` list — only
 * the label `<span>`s are hidden — and use `title` for a native tooltip
 * on each icon-only link, since there is no dedicated Tooltip primitive
 * in this codebase yet. `collapsed` is also threaded into `BusinessSwitcher`
 * so it hides the business name (avatar-only) the same way.
 *
 * `isActivePath` and the `sidebar_collapsed` cookie name (review-fix pass)
 * are single-sourced in `nav-items.ts` — see that file's doc comment —
 * rather than duplicated here, and item rendering is delegated to the
 * shared `nav-link.tsx`'s `NavLink`, also used by `mobile-nav-sheet.tsx`.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isActivePath, navItemsForRole, SIDEBAR_COLLAPSED_COOKIE } from "./nav-items";
import { NavLink } from "./nav-link";
import BusinessSwitcher from "./business-switcher";
import type { BusinessMembership, Role } from "@/lib/services/ports";

const COLLAPSED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/** Persists the collapsed/expanded choice client-side, mirrored server-side by `app/(dashboard)/layout.tsx`'s cookie read. */
function persistCollapsedCookie(collapsed: boolean): void {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed}; path=/; max-age=${COLLAPSED_COOKIE_MAX_AGE_SECONDS}`;
}

/**
 * Takes the plain `role` string (not a pre-filtered `NavItem[]`) and
 * filters `NAV_ITEMS` internally via `navItemsForRole`. A `NavItem[]`
 * carries a `lucide-react` icon component reference per entry, and this is
 * a Client Component — a Server Component (`app/(dashboard)/layout.tsx`)
 * passing that array as a prop trips this Next.js build's stricter RSC
 * serialization ("Only plain objects can be passed to Client Components…"
 * / "Functions cannot be passed directly to Client Components…") because
 * function/class-bearing values aren't valid serialized props. `role` is a
 * plain string, so it crosses the server/client boundary safely; the icon
 * components are resolved here, client-side, straight from the `NAV_ITEMS`
 * module import in `nav-items.ts` (which never crosses that boundary).
 */
export default function DashboardSidebar({
  role,
  currentBusinessId,
  memberships,
  defaultCollapsed = false,
}: {
  role: Role;
  currentBusinessId: string;
  memberships: BusinessMembership[];
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const items = navItemsForRole(role);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      persistCollapsedCookie(next);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
        collapsed ? "w-14 items-center p-2" : "w-60 p-4"
      )}
    >
      <div
        className={cn(
          "mb-2 flex items-center gap-1",
          collapsed ? "flex-col" : "justify-between"
        )}
      >
        <BusinessSwitcher
          currentBusinessId={currentBusinessId}
          memberships={memberships}
          collapsed={collapsed}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          className="shrink-0"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      <div className="mb-2 border-t border-sidebar-border" />

      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActivePath(pathname, item.href)}
          collapsed={collapsed}
        />
      ))}
    </aside>
  );
}
