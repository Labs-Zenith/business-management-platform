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
import { Building2, CreditCard, FileText, LayoutDashboard, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/customers": Users,
  "/invoices": FileText,
  "/payments": CreditCard,
  "/settings": Building2,
};

export default function DashboardBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = ICON_BY_HREF[item.href] ?? LayoutDashboard;

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
