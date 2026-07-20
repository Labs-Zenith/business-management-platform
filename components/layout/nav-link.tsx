"use client";

/**
 * Renders a single `NAV_ITEMS` entry consistently across both nav surfaces
 * (`dashboard-sidebar.tsx`'s desktop rail and `mobile-nav-sheet.tsx`'s
 * drawer) — review-fix pass, Fase 4 Lane C: the `<Link>` markup (base
 * className, icon + label + `aria-current` structure) was previously
 * copy-pasted between the two, risking silent drift. `collapsed`
 * (desktop-only) hides the inline label and, when true, exposes it via a
 * styled `Tooltip` (Plan Part C — the native `title` attribute alone is
 * slow to appear and unstyled); `onNavigate` (mobile-only) lets the drawer
 * close itself on click.
 *
 * The native `title` attribute is KEPT alongside the tooltip (not removed)
 * as a no-JS/assistive-tech fallback and because it's what currently gives
 * the collapsed link its accessible name (the icon is `aria-hidden`, and
 * the label `<span>` isn't rendered while collapsed). base-ui's Tooltip
 * does NOT wire up `aria-describedby`/accessible-name relationships on its
 * own (see `components/ui/tooltip.tsx`'s doc comment), so `title` isn't
 * redundant here — it's the only thing naming the link for AT users. The
 * styled tooltip is the primary, always-visible affordance on hover/focus
 * for sighted users.
 *
 * Uses `TooltipTrigger`'s `render` prop (same polymorphic pattern as
 * `DropdownMenuItem`+`Link` in `components/domain/export-menu.tsx`) so the
 * tooltip trigger IS the `<Link>` itself, not a wrapping `<button>`.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem } from "./nav-items";

const LINK_CLASSNAME_BASE =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

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
  const className = cn(
    LINK_CLASSNAME_BASE,
    collapsed && "justify-center px-2",
    active && "bg-sidebar-accent text-sidebar-accent-foreground [&>svg]:text-brand"
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              onClick={onNavigate}
              className={className}
            />
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={className}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
