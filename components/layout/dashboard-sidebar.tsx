"use client";

/**
 * Desktop nav ("Sidebar o navegacion lateral" per `docs/ui-ux-flow.md`'s
 * "En escritorio" section), visible at `md` and up. Mobile uses
 * `mobile-nav-sheet.tsx` instead (Fase 4 Lane C — replaces the removed
 * `dashboard-bottom-nav.tsx`) — both render the SAME `sidebar-content.tsx`
 * composition (Fase 5.1 Lane B) so the two surfaces never drift apart.
 *
 * Uses the `--sidebar*` token family from `app/globals.css` (not the
 * generic `--card`/`--accent` tokens) so the sidebar can read as a
 * distinct panel from the main content area, matching the dark
 * "sidebar + content" shell this was restyled after.
 *
 * This component now ONLY owns: the `<aside>` shell (rail width, border,
 * background), the `collapsed` state + cookie persistence, and the
 * collapse-toggle handler — everything else (switcher, nav list, bottom
 * user row) is delegated to `sidebar-content.tsx`, which also needs
 * `email` (threaded here from `app/(dashboard)/layout.tsx`'s `session`) to
 * render its bottom `SidebarUserMenu`.
 *
 * Collapse toggle (Fase 4 Lane C): `defaultCollapsed` is read server-side
 * from the `sidebar_collapsed` cookie by `app/(dashboard)/layout.tsx` and
 * passed down as this component's initial React state — this avoids a
 * hydration flash (a client-only `useState(false)` would render expanded
 * for one frame even when the user last chose collapsed). The toggle
 * button then flips local state AND persists the choice via
 * `document.cookie` (standard shadcn "cookie-backed sidebar" pattern),
 * so a reload restores it without any additional client-side fetch.
 *
 * `SIDEBAR_COLLAPSED_COOKIE` (review-fix pass) is single-sourced in
 * `nav-items.ts` — see that file's doc comment — rather than duplicated
 * here.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SIDEBAR_COLLAPSED_COOKIE } from "./nav-items";
import SidebarContent from "./sidebar-content";
import type { BusinessMembership, Role } from "@/lib/services/ports";

const COLLAPSED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/** Persists the collapsed/expanded choice client-side, mirrored server-side by `app/(dashboard)/layout.tsx`'s cookie read. */
function persistCollapsedCookie(collapsed: boolean): void {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed}; path=/; max-age=${COLLAPSED_COOKIE_MAX_AGE_SECONDS}`;
}

export default function DashboardSidebar({
  role,
  currentBusinessId,
  memberships,
  email,
  defaultCollapsed = false,
}: {
  role: Role;
  currentBusinessId: string;
  memberships: BusinessMembership[];
  email: string;
  defaultCollapsed?: boolean;
}) {
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
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
        collapsed ? "w-14 items-center p-2" : "w-60 px-2 py-4"
      )}
    >
      <SidebarContent
        role={role}
        currentBusinessId={currentBusinessId}
        memberships={memberships}
        email={email}
        collapsed={collapsed}
        showCollapseToggle
        onToggleCollapse={toggleCollapsed}
      />
    </aside>
  );
}
