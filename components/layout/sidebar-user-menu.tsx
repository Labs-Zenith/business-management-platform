"use client";

/**
 * Bottom-of-sidebar user row (Fase 5.1 Lane B — Vercel-style chrome),
 * rendered by `sidebar-content.tsx` (shared by both `dashboard-sidebar.tsx`
 * and `mobile-nav-sheet.tsx`) with `mt-auto` so it always sits at the
 * bottom, below the nav list. Replaces the previous topbar-based
 * `user-menu.tsx` (deleted — this is its direct successor, moved into the
 * sidebar/drawer chrome instead of the topbar).
 *
 * In expanded mode the WHOLE `[avatar + username]` row is the
 * `DropdownMenuTrigger` (a single `<button>` with a `ChevronsUpDown` on the
 * right, `aria-label="Opciones de cuenta"`) — clicking anywhere on the row
 * opens the menu, Vercel-style. In `collapsed` (rail) mode the avatar itself
 * is the trigger (logout must stay reachable in the narrow rail).
 *
 * The dropdown content: the username (`DropdownMenuLabel`, internal
 * `@zenith.app` domain hidden via `emailToUsername`) and a single
 * "Cerrar sesión" `DropdownMenuItem` that runs the same
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
import { avatarInitial, cn } from "@/lib/utils";
import { emailToUsername } from "@/lib/auth/username";
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

  // Show just the username in the UI — the internal `@zenith.app` domain is an
  // invisible login shim, not something the user should see.
  const displayName = emailToUsername(email);
  const initial = avatarInitial(displayName);

  const menuContent = (
    // Expanded: the trigger is the whole row, so the default
    // `w-(--anchor-width)` makes the menu exactly the sidebar's width and
    // `align="start"` lines it up with the row (no overflow). Collapsed: the
    // trigger is the ~w-14 avatar, so anchoring to it would be an unreadable
    // sliver — pin a fixed `w-56` there instead.
    <DropdownMenuContent
      align="start"
      side="top"
      className={cn("max-w-[calc(100vw-1rem)]", collapsed && "w-56")}
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
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
            title={displayName}
            aria-label={displayName}
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
          // Expanded mode: the whole `[avatar + username]` row IS the shadcn
          // DropdownMenu trigger (a button); the chevron on the right signals
          // the menu opens on click.
          <DropdownMenuTrigger
            disabled={isLoggingOut}
            aria-label="Opciones de cuenta"
            render={
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-sidebar-accent data-disabled:cursor-not-allowed data-disabled:opacity-50"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar size="sm" className="shrink-0">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    title={displayName}
                    className="truncate text-sm font-medium text-sidebar-foreground"
                  >
                    {displayName}
                  </span>
                </span>
                <Ellipsis aria-hidden="true" className="size-4 shrink-0 text-sidebar-foreground/60" />
              </button>
            }
          />
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
