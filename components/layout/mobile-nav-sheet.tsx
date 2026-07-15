"use client";

/**
 * Vercel-style mobile nav drawer (Fase 4 Lane C): a hamburger button
 * (visible only below `md`, mirroring `dashboard-sidebar.tsx`'s
 * `md:flex`/`md:hidden` breakpoint split) that opens a left `Sheet`,
 * REPLACING `dashboard-bottom-nav.tsx` (removed).
 *
 * Fase 5.1 Lane B: the drawer now renders the FULL `sidebar-content.tsx`
 * composition (business switcher, nav list, bottom user row) — the exact
 * same content `dashboard-sidebar.tsx` renders on desktop, so mobile and
 * desktop chrome are identical apart from the collapse toggle (desktop-only)
 * and the drawer wrapper itself. This means `MobileNavSheet` now needs
 * `currentBusinessId`/`memberships`/`email` in addition to `role`.
 *
 * `open`/`onOpenChange` is a controlled `useState` (not the Sheet's own
 * uncontrolled default) so `sidebar-content.tsx`'s `onNavigate` callback
 * (passed to every `NavLink`) can close the drawer immediately on a nav
 * click — a plain `next/link` click doesn't close a base-ui `Dialog` on its
 * own the way a `SheetClose`-wrapped trigger would. `onNavigate` is
 * deliberately NOT passed to `SidebarUserMenu`: closing the drawer during
 * logout would unmount its pending fetch and swallow a failure error.
 *
 * The `SheetTitle` ("Negocio") stays for accessibility (base-ui's `Dialog`
 * requires an accessible title) but is visually hidden (`sr-only`) since
 * `sidebar-content.tsx`'s own `BusinessSwitcher` already shows the current
 * business name at the top of the drawer — showing both would be visual
 * duplication.
 */

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import SidebarContent from "./sidebar-content";
import type { BusinessMembership, Role, SavedAccount } from "@/lib/services/ports";

export default function MobileNavSheet({
  role,
  currentBusinessId,
  memberships,
  savedAccounts,
  email,
}: {
  role: Role;
  currentBusinessId: string;
  memberships: BusinessMembership[];
  savedAccounts?: SavedAccount[];
  email: string;
}) {
  const [open, setOpen] = useState(false);

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
        <SheetHeader className="sr-only">
          <SheetTitle>Negocio</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col px-2 pt-2 pb-4">
          <SidebarContent
            role={role}
            currentBusinessId={currentBusinessId}
            memberships={memberships}
            savedAccounts={savedAccounts}
            email={email}
            collapsed={false}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
