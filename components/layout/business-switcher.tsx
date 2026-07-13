"use client";

/**
 * Lets a user with memberships in more than one business switch the active
 * one from the topbar. POSTs `{ businessId }` to
 * `/api/auth/switch-business` (PR2) and, on success, calls
 * `useRouter().refresh()` so every Server Component on the CURRENT route
 * re-fetches data scoped to the new `businessId` — matching
 * `design.md`'s "Data Flow (switch)" contract exactly. A hard navigation to
 * `/dashboard` is intentionally NOT used: it would yank the user away from
 * whatever `(dashboard)` page they were on (e.g. an invoice detail) just
 * because they switched businesses, which `refresh()` alone does not do.
 *
 * Mirrors `logout-button.tsx`'s and `app/(auth)/login/page.tsx`'s
 * fetch/pending/error shape: a local `error` string rendered as
 * `role="alert"`, and a disabled/pending trigger while the request is
 * in flight.
 *
 * Only renders the dropdown when the user holds more than one membership
 * (`memberships.length <= 1` is the static guard) — this covers both the
 * "exactly one membership" case (nothing to switch to) and the "zero
 * memberships" case (nothing to render as options at all), showing a
 * non-interactive avatar (business initial) instead.
 *
 * The trigger itself (Fase 4 Lane C — business switcher as an avatar) is a
 * small round `Avatar`/`AvatarFallback` showing the current business
 * name's first initial, matching `dashboard-topbar.tsx`'s session avatar —
 * NOT the previous labeled button (name + chevron). The visible name is
 * intentionally dropped, so `title`/`aria-label` carry the current business
 * name for accessibility instead. Composed via `DropdownMenuTrigger`'s
 * polymorphic `render` prop (same pattern as `components/domain/export-menu.tsx`),
 * with `nativeButton={false}` since the rendered element is a `<span>`
 * (`Avatar`'s root), not a `<button>` — this makes base-ui's `useButton`
 * emit `role="button"` and `aria-disabled` (rather than a native `disabled`
 * attribute) when `isSwitching` is true.
 *
 * The avatar initial is derived via `lib/utils.ts`'s shared `avatarInitial`
 * (review-fix pass) rather than an inline `charAt(0)` — that inline version
 * returned an empty string (blank avatar) for an empty business name;
 * `avatarInitial` falls back to `"?"` instead, and is also used by
 * `dashboard-topbar.tsx`'s session avatar so both derive the initial the
 * same way.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessMembership } from "@/lib/services/ports";
import { avatarInitial } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GENERIC_ERROR_MESSAGE = "No se pudo cambiar de negocio. Intenta de nuevo.";

type BusinessSwitcherProps = {
  currentBusinessId: string;
  memberships: BusinessMembership[];
};

export default function BusinessSwitcher({
  currentBusinessId,
  memberships,
}: BusinessSwitcherProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const current = memberships.find((membership) => membership.businessId === currentBusinessId);
  const currentName = current?.businessName ?? "Negocio";

  if (memberships.length <= 1) {
    return (
      <Avatar size="sm" title={currentName} aria-label={currentName}>
        <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
          {avatarInitial(currentName)}
        </AvatarFallback>
      </Avatar>
    );
  }

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
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isSwitching}
          nativeButton={false}
          title={triggerLabel}
          aria-label={triggerLabel}
          render={
            <Avatar
              size="sm"
              className="cursor-pointer data-disabled:cursor-not-allowed data-disabled:opacity-50"
            >
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                {avatarInitial(currentName)}
              </AvatarFallback>
            </Avatar>
          }
        />
        <DropdownMenuContent align="end">
          {otherBusinesses.map((membership) => (
            <DropdownMenuItem
              key={membership.businessId}
              onClick={() => handleSwitch(membership.businessId)}
            >
              {membership.businessName}
            </DropdownMenuItem>
          ))}
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
