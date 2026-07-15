"use client";

/**
 * Unified account + business switcher, rendered at the TOP of
 * `sidebar-content.tsx` (shared by the desktop sidebar and the mobile drawer).
 * Shows the current business avatar + name; clicking the trigger expands an
 * inline `Collapsible` panel (Vercel-style, not a floating popup) with three
 * sections:
 *   1. the CURRENT account's OTHER businesses → `POST /api/auth/switch-business`
 *      (same-user, instant, keeps you on the current route via `router.refresh()`).
 *   2. "Otras cuentas" — other accounts saved on this device (Wave 3,
 *      Instagram-style) → `POST /api/auth/switch-account { userId }` (instant,
 *      no re-login: the server activates that account's saved Supabase session).
 *   3. "Agregar cuenta" → navigates to `/login?next=<current path>` so a new
 *      login is appended to the saved accounts and returns here.
 *
 * `collapsed` (rail mode) hides the name/chevron and force-closes the panel
 * (otherwise the crammed names/accounts render into the w-14 rail).
 *
 * GOTCHA: base-ui's `CollapsibleTrigger` uses `useButton({focusableWhenDisabled:
 * true})`, so a disabled trigger surfaces as `aria-disabled="true"` (still
 * focusable), NOT the native `disabled` attribute — tests assert `aria-disabled`.
 * The saved-account/business `<button>`s are real native buttons and DO get the
 * real `disabled` attribute.
 *
 * No refresh token or secret ever reaches this component: `SavedAccount` only
 * carries `{userId, email, label, active}` (see `lib/services/ports.ts`); the
 * stored refresh tokens live server-side in the httpOnly `saved_accounts`
 * cookie and are activated exclusively by the `switch-account` route.
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";
import type { BusinessMembership, SavedAccount } from "@/lib/services/ports";
import { avatarInitial, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "@/components/ui/collapsible";

const BUSINESS_ERROR_MESSAGE = "No se pudo cambiar de negocio. Intenta de nuevo.";
const ACCOUNT_ERROR_MESSAGE = "No se pudo cambiar de cuenta. Inicia sesión de nuevo.";

type BusinessSwitcherProps = {
  currentBusinessId: string;
  memberships: BusinessMembership[];
  savedAccounts?: SavedAccount[];
  collapsed?: boolean;
};

export default function BusinessSwitcher({
  currentBusinessId,
  memberships,
  savedAccounts = [],
  collapsed = false,
}: BusinessSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  // Force the panel closed in rail (collapsed) mode so the names/accounts
  // never render crammed into the w-14 rail.
  const panelOpen = collapsed ? false : open;

  const current = memberships.find((membership) => membership.businessId === currentBusinessId);
  const currentName = current?.businessName ?? "Negocio";

  const otherBusinesses = memberships.filter(
    (membership) => membership.businessId !== currentBusinessId
  );
  // Other accounts saved on this device (never the currently-active one).
  const otherAccounts = savedAccounts.filter((account) => !account.active);

  async function post(url: string, body: Record<string, string>, fallbackError: string) {
    if (isSwitching) return;
    setError(null);
    setIsSwitching(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const parsed: { error?: { message?: string } } | null = await response
          .json()
          .catch(() => null);
        setError(parsed?.error?.message ?? fallbackError);
        return;
      }
      router.refresh();
    } catch {
      setError(fallbackError);
    } finally {
      setIsSwitching(false);
    }
  }

  function handleSwitchBusiness(businessId: string) {
    void post("/api/auth/switch-business", { businessId }, BUSINESS_ERROR_MESSAGE);
  }

  function handleSwitchAccount(userId: string) {
    void post("/api/auth/switch-account", { userId }, ACCOUNT_ERROR_MESSAGE);
  }

  function handleAddAccount() {
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
  }

  const triggerLabel = isSwitching ? "Cambiando..." : currentName;

  return (
    <Collapsible
      open={panelOpen}
      onOpenChange={(next) => {
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
              onClick={() => handleSwitchBusiness(membership.businessId)}
              className="rounded-md px-1.5 py-1 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {membership.businessName}
            </button>
          ))}

          {otherAccounts.length > 0 ? (
            <>
              <p className="px-1.5 pt-2 pb-0.5 text-xs font-medium text-sidebar-foreground/50">
                Otras cuentas
              </p>
              {otherAccounts.map((account) => (
                <button
                  key={account.userId}
                  type="button"
                  disabled={isSwitching}
                  onClick={() => handleSwitchAccount(account.userId)}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Avatar size="sm" className="shrink-0">
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                      {avatarInitial(account.label || account.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{account.label || account.email}</span>
                </button>
              ))}
            </>
          ) : null}

          <button
            type="button"
            disabled={isSwitching}
            onClick={handleAddAccount}
            className="mt-1 flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            Agregar cuenta
          </button>
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
