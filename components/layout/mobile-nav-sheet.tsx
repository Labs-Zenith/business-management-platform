"use client";

/**
 * Vercel-style mobile nav drawer (Fase 4 Lane C): a hamburger button
 * (visible only below `md`, mirroring `dashboard-sidebar.tsx`'s
 * `md:flex`/`md:hidden` breakpoint split) that opens the SAME
 * `navItemsForRole(role)` list as a left `Sheet`, REPLACING
 * `dashboard-bottom-nav.tsx` (removed — see `app/(dashboard)/layout.tsx`).
 * Item styling reuses `dashboard-sidebar.tsx`'s `--sidebar*` token classes
 * so the drawer reads as "the sidebar, temporarily overlaid" rather than a
 * new visual language.
 *
 * `open`/`onOpenChange` is a controlled `useState` (not the Sheet's own
 * uncontrolled default) so each nav `Link`'s `onClick` can close the
 * drawer immediately on navigation, per `components/ui/sheet.tsx`'s
 * `Dialog`-backed `Sheet` — a plain `next/link` click doesn't close a
 * base-ui `Dialog` on its own the way a `SheetClose`-wrapped trigger would.
 *
 * Takes the plain `role` string (not a pre-filtered `NavItem[]`), same
 * rationale as `dashboard-sidebar.tsx`/`dashboard-bottom-nav.tsx`: a
 * `NavItem[]` carries `lucide-react` icon component references per entry,
 * which this Next.js build's stricter RSC serialization rejects as a
 * Server-to-Client Component prop. `navItemsForRole` runs here, client-side.
 *
 * Item rendering (review-fix pass) is delegated to the shared
 * `nav-link.tsx`'s `NavLink` — also used by `dashboard-sidebar.tsx` — so the
 * two surfaces never drift in markup/styling; `isActivePath` is likewise
 * single-sourced in `nav-items.ts`.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isActivePath, navItemsForRole } from "./nav-items";
import { NavLink } from "./nav-link";
import type { Role } from "@/lib/services/ports";

export default function MobileNavSheet({ role }: { role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = navItemsForRole(role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader>
          <SheetTitle>Negocio</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4 pb-4">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href)}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
