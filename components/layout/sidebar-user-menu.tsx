"use client";

/**
 * Bottom-of-sidebar user row (Fase 5.1 Lane B — Vercel-style chrome),
 * rendered by `sidebar-content.tsx` (shared by both `dashboard-sidebar.tsx`
 * and `mobile-nav-sheet.tsx`) with `mt-auto` so it always sits at the
 * bottom, below the nav list. Replaces the previous topbar-based
 * `user-menu.tsx` (deleted — this is its direct successor, moved into the
 * sidebar/drawer chrome instead of the topbar).
 *
 * Fase 5.2 F3 restructured the row to match Vercel's own chrome: in
 * expanded mode, `[avatar + email]` is now a plain NON-interactive row on
 * the left, and a small `⋯` icon button sits on the right (`justify-
 * between`) as the actual `DropdownMenuTrigger` (`Button
 * variant="ghost" size="icon-sm"`, `aria-label="Opciones de cuenta"`).
 * Previously the entire row (avatar + email) was itself the trigger; that
 * made the whole row look clickable/navigable when its only action is
 * opening a menu with a single "Cerrar sesion" item, which reads as
 * over-affordance next to `NavLink`'s real navigation rows. In `collapsed`
 * (rail) mode there's no room for a separate `⋯` button, so the avatar
 * itself remains the trigger there (logout must stay reachable).
 *
 * The dropdown content is unchanged: session email (`DropdownMenuLabel`)
 * and a single "Cerrar sesion" `DropdownMenuItem` that runs the same
 * `POST /api/auth/logout -> router.push("/login")` logic `user-menu.tsx`
 * used to run. Mirrors `business-switcher.tsx`'s fetch/pending/error shape:
 * a local `error` string rendered as `role="alert"`, and a disabled/pending
 * trigger while the request is in flight.
 *
 * Both triggers are composed via `DropdownMenuTrigger`'s polymorphic
 * `render` prop as a real `<button>`/`Button`, same pattern as
 * `business-switcher.tsx` and `export-menu.tsx` — so `nativeButton` stays
 * at its default `true` (native `disabled` attribute while logging out).
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
import { Ellipsis } from "lucide-react";
import { avatarInitial } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GENERIC_ERROR_MESSAGE = "No se pudo cerrar sesión. Intenta de nuevo.";

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

  const menuContent = (
    // `w-64` (+ align="end") overrides DropdownMenuContent's default
    // `w-(--anchor-width)`: the trigger here is a ~32px icon button (⋯ / the
    // rail avatar), so anchoring the menu to the trigger width would shrink it
    // to an unreadable sliver that clips the email. A fixed width + `align="end"`
    // keeps it inside the viewport instead of overflowing off the right edge.
    <DropdownMenuContent align="end" side="top" className="w-64 max-w-[calc(100vw-1rem)]">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleLogout} disabled={isLoggingOut}>
        {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <div className="flex w-full flex-col gap-1">
      <DropdownMenu>
        {collapsed ? (
          // Rail mode: no room for a separate `⋯` button, so the avatar
          // itself is the trigger (logout must stay reachable).
          <DropdownMenuTrigger
            disabled={isLoggingOut}
            title={email}
            aria-label={email}
            render={
              <button
                type="button"
                className="flex w-full items-center justify-center rounded-md p-1 transition-colors hover:bg-sidebar-accent data-disabled:cursor-not-allowed data-disabled:opacity-50"
              >
                <Avatar size="sm" className="shrink-0">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </button>
            }
          />
        ) : (
          // Expanded mode: `[avatar + email]` is a plain, non-interactive
          // row; the `⋯` button on the right is the actual trigger.
          <div className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar size="sm" className="shrink-0">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span
                title={email}
                className="truncate text-sm font-medium text-sidebar-foreground"
              >
                {email}
              </span>
            </div>
            <DropdownMenuTrigger
              disabled={isLoggingOut}
              aria-label="Opciones de cuenta"
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                >
                  <Ellipsis aria-hidden="true" />
                </Button>
              }
            />
          </div>
        )}
        {menuContent}
      </DropdownMenu>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
