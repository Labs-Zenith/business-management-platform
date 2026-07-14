"use client";

/**
 * Lets a user with memberships in more than one business switch the active
 * one. Rendered at the TOP of `sidebar-content.tsx` (shared by both the
 * desktop sidebar and the mobile drawer — Fase 5.1 Lane B), showing the
 * current business avatar + name.
 *
 * Fase 5.1 Lane B rewrite: this is now a `Collapsible` (not a `DropdownMenu`)
 * — clicking the trigger expands an INLINE panel below it listing the other
 * businesses to switch to (pushing the nav list down), matching the target
 * "Vercel-style" sidebar layout rather than a floating popup. The previous
 * "Configuración"/"Editar perfil" links are REMOVED from here — `Settings`
 * is now its own `NAV_ITEMS` entry (see `nav-items.ts`), reachable from the
 * nav list like any other section, so this component no longer needs to
 * surface account-level links itself. `collapsed` (threaded from
 * `dashboard-sidebar.tsx`'s own collapse state) hides the name and the
 * chevron icon, avatar-only, matching how `NavLink` collapses.
 *
 * POSTs `{ businessId }` to `/api/auth/switch-business` (PR2) and, on
 * success, calls `useRouter().refresh()` so every Server Component on the
 * CURRENT route re-fetches data scoped to the new `businessId` — matching
 * `design.md`'s "Data Flow (switch)" contract exactly. A hard navigation to
 * `/dashboard` is intentionally NOT used: it would yank the user away from
 * whatever `(dashboard)` page they were on (e.g. an invoice detail) just
 * because they switched businesses, which `refresh()` alone does not do.
 *
 * Mirrors `sidebar-user-menu.tsx`'s fetch/pending/error shape: a local
 * `error` string rendered as `role="alert"`, and a disabled/pending trigger
 * while the request is in flight.
 *
 * The trigger is `CollapsibleTrigger`, which renders a real `<button>`
 * natively (no polymorphic `render` prop needed, unlike the previous
 * `DropdownMenuTrigger`-based version) — its accessible name is pinned via
 * an explicit `aria-label`/`title` (rather than derived from its visual
 * content) so the avatar-fallback initial text never leaks into it, and so
 * the accessible name stays stable in `collapsed` mode where the name/icon
 * are visually hidden. Controlled `open` state so it can be force-closed when
 * the sidebar collapses to its rail (otherwise a previously-expanded panel
 * would render the business names crammed into the narrow rail).
 *
 * GOTCHA: base-ui's `CollapsibleTrigger` internally calls its `useButton`
 * hook with `focusableWhenDisabled: true`, so a `disabled` trigger surfaces
 * as `aria-disabled="true"` (remaining focusable), NOT the native `disabled`
 * HTML attribute — unlike `MenuPrimitive.Trigger`-composed triggers
 * elsewhere in this codebase (e.g. the old `DropdownMenuTrigger`-based
 * version of this component, or `sidebar-user-menu.tsx`'s trigger), which DO
 * get the real `disabled` attribute when `nativeButton` stays at its
 * default `true`. Tests here assert `aria-disabled`, not `toBeDisabled()`.
 *
 * The avatar initial is derived via `lib/utils.ts`'s shared `avatarInitial`,
 * also used by `sidebar-user-menu.tsx`'s session avatar, so both derive the
 * initial the same way (falls back to `"?"` for an empty name instead of a
 * blank avatar).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import type { BusinessMembership } from "@/lib/services/ports";
import { avatarInitial, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "@/components/ui/collapsible";

const GENERIC_ERROR_MESSAGE = "No se pudo cambiar de negocio. Intenta de nuevo.";

type BusinessSwitcherProps = {
  currentBusinessId: string;
  memberships: BusinessMembership[];
  collapsed?: boolean;
};

export default function BusinessSwitcher({
  currentBusinessId,
  memberships,
  collapsed = false,
}: BusinessSwitcherProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  // Force the panel closed in rail (collapsed) mode: otherwise a panel the
  // user had expanded before collapsing stays open, showing the business
  // names crammed into the w-14 rail. Derived (no effect) so it's lint-clean;
  // re-expanding the sidebar restores whatever open state it had.
  const panelOpen = collapsed ? false : open;

  const current = memberships.find((membership) => membership.businessId === currentBusinessId);
  const currentName = current?.businessName ?? "Negocio";

  const otherBusinesses = memberships.filter(
    (membership) => membership.businessId !== currentBusinessId
  );

  async function handleSwitch(businessId: string) {
    // Explicit re-entrancy guard: the trigger's `disabled={isSwitching}` and
    // the panel buttons' own `disabled={isSwitching}` already prevent
    // re-opening the panel / clicking a second business while a switch is in
    // flight (native `disabled` on real `<button>`s), but guarding here too
    // means the no-double-submit property holds even if that ever changes.
    if (isSwitching) return;

    setError(null);
    setIsSwitching(true);

    try {
      const response = await fetch("/api/auth/switch-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response
          .json()
          .catch(() => null);
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSwitching(false);
    }
  }

  const triggerLabel = isSwitching ? "Cambiando de negocio..." : currentName;

  return (
    <Collapsible
      open={panelOpen}
      onOpenChange={(next) => {
        // Ignore toggles while in rail mode (the trigger shows avatar-only there).
        if (!collapsed) setOpen(next);
      }}
      className="flex w-full flex-col gap-1"
    >
      <CollapsibleTrigger
        disabled={isSwitching}
        title={triggerLabel}
        aria-label={triggerLabel}
        className={cn(
          "flex w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-sidebar-accent data-disabled:cursor-not-allowed data-disabled:opacity-50",
          collapsed ? "justify-center p-1" : "px-1.5 py-1"
        )}
      >
        <Avatar size="sm" className="shrink-0">
          <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
            {avatarInitial(currentName)}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-sm font-medium text-sidebar-foreground">
              {triggerLabel}
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-sidebar-foreground/60"
              aria-hidden="true"
            />
          </>
        )}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="flex flex-col gap-0.5 py-1 pl-1">
          {otherBusinesses.map((membership) => (
            <button
              key={membership.businessId}
              type="button"
              disabled={isSwitching}
              onClick={() => handleSwitch(membership.businessId)}
              className="rounded-md px-1.5 py-1 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {membership.businessName}
            </button>
          ))}
        </div>
      </CollapsiblePanel>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </Collapsible>
  );
}
