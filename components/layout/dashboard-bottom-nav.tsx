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
import { NAV_ITEMS } from "./nav-items";

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background md:hidden">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-muted-foreground",
            isActivePath(pathname, item.href) && "text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
