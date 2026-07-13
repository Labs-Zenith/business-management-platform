"use client";

/**
 * Desktop nav ("Sidebar o navegacion lateral" per `docs/ui-ux-flow.md`'s
 * "En escritorio" section), visible at `md` and up. Mobile uses
 * `dashboard-bottom-nav.tsx` instead — both read from the same
 * `NAV_ITEMS` source of truth.
 *
 * Uses the `--sidebar*` token family from `app/globals.css` (not the
 * generic `--card`/`--accent` tokens) so the sidebar can read as a
 * distinct panel from the main content area, matching the dark
 * "sidebar + content" shell this was restyled after.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItemsForRole } from "./nav-items";
import type { Role } from "@/lib/services/ports";

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
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
export default function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex">
      <div className="mb-4 flex items-center gap-2 px-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Wallet className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Negocio</span>
      </div>

      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}
