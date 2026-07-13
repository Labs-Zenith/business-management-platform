"use client";

/**
 * Renders a single `NAV_ITEMS` entry consistently across both nav surfaces
 * (`dashboard-sidebar.tsx`'s desktop rail and `mobile-nav-sheet.tsx`'s
 * drawer) — review-fix pass, Fase 4 Lane C: the `<Link>` markup (base
 * className, icon + label + `aria-current` structure) was previously
 * copy-pasted between the two, risking silent drift. Pure extraction, no
 * styling/behavior change: `collapsed` (desktop-only) hides the label and
 * exposes it via `title` instead; `onNavigate` (mobile-only) lets the
 * drawer close itself on click.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

export function NavLink({
  item,
  active,
  collapsed = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-2",
        active && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}
