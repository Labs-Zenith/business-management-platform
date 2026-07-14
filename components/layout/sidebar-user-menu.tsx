"use client";

/**
 * Bottom-of-sidebar user row (Fase 5.1 Lane B — Vercel-style chrome),
 * rendered by `sidebar-content.tsx` (shared by both `dashboard-sidebar.tsx`
 * and `mobile-nav-sheet.tsx`) with `mt-auto` so it always sits at the
 * bottom, below the nav list. Replaces the previous topbar-based
 * `user-menu.tsx` (deleted — this is its direct successor, moved into the
 * sidebar/drawer chrome instead of the topbar).
 *
 * The avatar + email trigger opens a `DropdownMenu` showing the session
 * email (`DropdownMenuLabel`) and a single "Cerrar sesion" `DropdownMenuItem`
 * that runs the same `POST /api/auth/logout -> router.push("/login")` logic
 * `user-menu.tsx` used to run. Mirrors `business-switcher.tsx`'s
 * fetch/pending/error shape: a local `error` string rendered as
 * `role="alert"`, and a disabled/pending trigger while the request is in
 * flight.
 *
 * The trigger is composed via `DropdownMenuTrigger`'s polymorphic `render`
 * prop as a real `<button>` (avatar + email label), same pattern as
 * `business-switcher.tsx` — so `nativeButton` stays at its default `true`
 * (native `disabled` attribute while logging out) rather than
 * `user-menu.tsx`'s old `nativeButton={false}` (which was needed there only
 * because that trigger was an `Avatar`/`<span>`, not a `<button>`).
 *
 * `collapsed` hides the email label (avatar-only), matching how
 * `business-switcher.tsx` and `NavLink` collapse.
 *
 * Deliberately does NOT take an `onNavigate`/close-the-drawer callback (this
 * used to fire one synchronously at the start of `handleLogout`, mirroring
 * `NavLink`'s immediate-close-on-click UX): in the mobile drawer that closed
 * (unmounted) the Sheet before the logout `fetch` had a chance to settle, so
 * a FAILED logout (network/401/500) closed the drawer and silently swallowed
 * the error — the user saw no feedback and stayed logged in. Logout is the
 * only action in this menu, so the fix is to never close the drawer as part
 * of it: on success `router.push("/login")` navigates away (making the
 * drawer moot), and on failure the drawer stays open so the `role="alert"`
 * error is visible.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avatarInitial, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GENERIC_ERROR_MESSAGE = "No se pudo cerrar sesion. Intenta de nuevo.";

type SidebarUserMenuProps = {
  email: string;
  collapsed?: boolean;
};

export default function SidebarUserMenu({ email, collapsed = false }: SidebarUserMenuProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;

    setError(null);
    setIsLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setError(GENERIC_ERROR_MESSAGE);
        return;
      }

      router.push("/login");
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsLoggingOut(false);
    }
  }

  const initial = avatarInitial(email);

  return (
    <div className="flex w-full flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isLoggingOut}
          title={email}
          aria-label={email}
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
                  {initial}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {email}
                </span>
              )}
            </button>
          }
        />
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{email}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? "Cerrando sesion..." : "Cerrar sesion"}
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
