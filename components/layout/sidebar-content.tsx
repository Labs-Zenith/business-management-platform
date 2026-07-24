"use client";

/**
 * Shared sidebar chrome composition (Fase 5.1 Lane B), rendered IDENTICALLY
 * by both `dashboard-sidebar.tsx` (desktop `<aside>`) and
 * `mobile-nav-sheet.tsx` (mobile drawer `Sheet`), so the two surfaces never
 * drift apart. Top to bottom: `BusinessSwitcher` (+ the collapse toggle
 * button, desktop-only via `showCollapseToggle`), a `flex-1` nav region
 * (`navItemsForRole(role).map(<NavLink/>)`), and — pinned to the bottom via
 * `mt-auto` — `SidebarUserMenu`.
 *
 * Takes the plain `role` string (not a pre-filtered `NavItem[]`) and filters
 * `NAV_ITEMS` internally via `navItemsForRole`, same rationale as the
 * previous `dashboard-sidebar.tsx`/`mobile-nav-sheet.tsx`: a `NavItem[]`
 * carries `lucide-react` icon component references per entry, which this
 * Next.js build's stricter RSC serialization rejects as a Server-to-Client
 * Component prop ("Only plain objects can be passed to Client
 * Components…"). `role` is a plain string, so it crosses that boundary
 * safely; `navItemsForRole` and the icon resolution both happen here,
 * client-side.
 *
 * `onNavigate` (mobile-only) is threaded to every `NavLink` so the drawer
 * closes itself immediately on a nav link click — the desktop sidebar simply
 * never passes it, so `NavLink`'s `onClick={onNavigate}` is a no-op there.
 * Deliberately NOT passed to `SidebarUserMenu`: closing the drawer as part of
 * logout would unmount it (and its pending `fetch`) before a failure could
 * be shown, silently swallowing logout errors on mobile. Logout is the only
 * action in that menu, so it navigates away itself on success
 * (`router.push("/login")`) and stays open to show its own `role="alert"` on
 * failure.
 *
 * `showCollapseToggle`/`onToggleCollapse` are optional and desktop-only:
 * `dashboard-sidebar.tsx` owns the actual collapse state + cookie
 * persistence and passes both down; `mobile-nav-sheet.tsx` never renders
 * the toggle (the drawer itself is the "collapse" affordance on mobile —
 * closing it), and always renders with `collapsed={false}`.
 */

import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isActivePath, navItemsFor } from "./nav-items";
import { NavLink } from "./nav-link";
import BusinessSwitcher from "./business-switcher";
import SidebarUserMenu from "./sidebar-user-menu";
import type { BusinessMembership, Role, SavedAccount } from "@/lib/services/ports";

type SidebarContentProps = {
  role: Role;
  currentBusinessId: string;
  memberships: BusinessMembership[];
  savedAccounts?: SavedAccount[];
  email: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  showCollapseToggle?: boolean;
  onToggleCollapse?: () => void;
};

export default function SidebarContent({
  role,
  currentBusinessId,
  memberships,
  savedAccounts = [],
  email,
  collapsed = false,
  onNavigate,
  showCollapseToggle = false,
  onToggleCollapse,
}: SidebarContentProps) {
  const pathname = usePathname();
  // `navItemsFor` (not `navItemsForRole`) — layers the per-business
  // "Ventas" feature-flag filter on top of the role filter; `currentBusinessId`
  // is already threaded to this component for `BusinessSwitcher`, so no
  // additional prop plumbing through `app/(dashboard)/layout.tsx` was needed.
  const items = navItemsFor(role, currentBusinessId);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div
        className={cn(
          "mb-2 flex gap-1",
          collapsed ? "flex-col items-center" : "items-start justify-between px-1"
        )}
      >
        <BusinessSwitcher
          currentBusinessId={currentBusinessId}
          memberships={memberships}
          savedAccounts={savedAccounts}
          collapsed={collapsed}
        />
        {showCollapseToggle && onToggleCollapse ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapse}
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
        ) : null}
      </div>

      <div className="mb-2 border-t border-sidebar-border" />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActivePath(pathname, item.href)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="mt-auto border-t border-sidebar-border pt-2">
        <SidebarUserMenu email={email} collapsed={collapsed} />
      </div>
    </div>
  );
}
