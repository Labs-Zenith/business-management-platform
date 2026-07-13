"use client";

/**
 * Mobile nav ("Navegacion inferior o menu compacto" per
 * `docs/ui-ux-flow.md`'s "En movil" section), a fixed bottom bar visible
 * below `md`. Desktop uses `dashboard-sidebar.tsx` instead — both read from
 * the same `NAV_ITEMS` source of truth. `app/(dashboard)/layout.tsx` adds
 * bottom padding to `<main>` on mobile so page content never sits under
 * this fixed bar.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "./nav-items";

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Tailwind cannot safelist a dynamically interpolated `grid-cols-${n}`
 * class (it statically scans source for literal class names), so the
 * column count must be resolved via a static lookup keyed by the actual
 * item count — see `design.md`'s "Open Questions — Bottom-nav column
 * count" resolution. Falls back to `grid-cols-5` for any unmapped count
 * rather than emitting no grid class at all.
 */
const GRID_COLS: Record<number, string> = {
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
};

export function gridColsClass(itemCount: number): string {
  const gridClass = GRID_COLS[itemCount];
  if (!gridClass && process.env.NODE_ENV !== "production") {
    // Surface this loudly in dev/test rather than letting a new nav item
    // silently mis-render into the wrong column count in production.
    console.warn(`gridColsClass: no entry for ${itemCount} items — add one to GRID_COLS.`);
  }
  return gridClass ?? "grid-cols-5";
}

/**
 * `items` (optional, defaults to `NAV_ITEMS`) lets a caller pass an
 * already role-filtered list — see `nav-items.ts`'s `navItemsForRole` and
 * `app/(dashboard)/layout.tsx`, which passes
 * `navItemsForRole(session.role)`. Additive/backward-compatible: existing
 * callers that don't pass `items` keep rendering the full unfiltered list.
 */
export default function DashboardBottomNav({ items = NAV_ITEMS }: { items?: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <div className={cn("grid gap-1", gridColsClass(items.length))}>
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1.5 text-[0.72rem] font-medium leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
