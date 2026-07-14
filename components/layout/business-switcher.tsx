"use client";

/**
 * Lets a user with memberships in more than one business switch the active
 * one, plus (Fase 5 Lane 1 — Vercel-style chrome) surfaces account-level
 * links ("Configuración"/"Editar perfil") below the switch options. Rendered
 * at the TOP of `dashboard-sidebar.tsx` (moved from the topbar), showing the
 * current business avatar + name — `collapsed` (threaded from
 * `dashboard-sidebar.tsx`'s own collapse state) hides the name, avatar-only,
 * matching how `NavLink` collapses.
 *
 * POSTs `{ businessId }` to `/api/auth/switch-business` (PR2) and, on
 * success, calls `useRouter().refresh()` so every Server Component on the
 * CURRENT route re-fetches data scoped to the new `businessId` — matching
 * `design.md`'s "Data Flow (switch)" contract exactly. A hard navigation to
 * `/dashboard` is intentionally NOT used: it would yank the user away from
 * whatever `(dashboard)` page they were on (e.g. an invoice detail) just
 * because they switched businesses, which `refresh()` alone does not do.
 *
 * Mirrors `user-menu.tsx`'s and `app/(auth)/login/page.tsx`'s
 * fetch/pending/error shape: a local `error` string rendered as
 * `role="alert"`, and a disabled/pending trigger while the request is
 * in flight.
 *
 * The dropdown ALWAYS renders (even with a single/zero membership) so the
 * "Configuración"/"Editar perfil" links stay reachable regardless of how
 * many businesses the user belongs to; the switch-business items themselves
 * (and the separator above the account links) only render when there is at
 * least one OTHER business to switch to.
 *
 * The trigger (Fase 4 Lane C — business switcher as an avatar, now with a
 * name label alongside it per Fase 5 Lane 1) is a small round
 * `Avatar`/`AvatarFallback` showing the current business name's first
 * initial, plus the business name as text (hidden when `collapsed`).
 * Composed via `DropdownMenuTrigger`'s polymorphic `render` prop (same
 * pattern as `components/domain/export-menu.tsx`), rendering a real
 * `<button>` (so `nativeButton` stays at its default `true`) rather than the
 * previous bare `Avatar`-as-trigger, since the trigger now also contains the
 * name label.
 *
 * The avatar initial is derived via `lib/utils.ts`'s shared `avatarInitial`
 * (review-fix pass) rather than an inline `charAt(0)` — that inline version
 * returned an empty string (blank avatar) for an empty business name;
 * `avatarInitial` falls back to `"?"` instead, and is also used by
 * `user-menu.tsx`'s session avatar so both derive the initial the same way.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BusinessMembership } from "@/lib/services/ports";
import { avatarInitial, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const current = memberships.find((membership) => membership.businessId === currentBusinessId);
  const currentName = current?.businessName ?? "Negocio";

  const otherBusinesses = memberships.filter(
    (membership) => membership.businessId !== currentBusinessId
  );

  async function handleSwitch(businessId: string) {
    // Explicit re-entrancy guard: the trigger's `disabled={isSwitching}`
    // already prevents opening the dropdown again while a switch is in
    // flight, but that alone depends on the dropdown library's own
    // close-on-click/inert behavior. Guarding here too means the
    // no-double-submit property holds even if that library's default
    // behavior ever changes.
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
    <div className="flex w-full flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isSwitching}
          title={triggerLabel}
          aria-label={triggerLabel}
          render={
            <button
              type="button"
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
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {triggerLabel}
                </span>
              )}
            </button>
          }
        />
        <DropdownMenuContent align="start">
          {otherBusinesses.map((membership) => (
            <DropdownMenuItem
              key={membership.businessId}
              onClick={() => handleSwitch(membership.businessId)}
            >
              {membership.businessName}
            </DropdownMenuItem>
          ))}
          {otherBusinesses.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem nativeButton={false} render={<Link href="/settings" />}>
            Configuración
          </DropdownMenuItem>
          <DropdownMenuItem nativeButton={false} render={<Link href="/settings" />}>
            Editar perfil
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
