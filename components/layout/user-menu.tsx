"use client";

/**
 * User avatar dropdown in the topbar (Fase 5 Lane 1 — Vercel-style chrome).
 * Replaces the previous static session `Avatar` + separate `LogoutButton`:
 * the avatar itself is now the `DropdownMenuTrigger`, and its content shows
 * the session email (`DropdownMenuLabel`) plus a single "Cerrar sesion"
 * `DropdownMenuItem` that runs the same
 * `POST /api/auth/logout -> router.push("/login")` logic that used to live
 * in `logout-button.tsx` (deleted — this was its only caller).
 *
 * Mirrors `business-switcher.tsx`'s fetch/pending/error shape: a local
 * `error` string rendered as `role="alert"`, and a disabled/pending trigger
 * while the request is in flight. Composed via `DropdownMenuTrigger`'s
 * polymorphic `render` prop (same pattern as `business-switcher.tsx`), with
 * `nativeButton={false}` since the rendered element is a `<span>`
 * (`Avatar`'s root), not a `<button>`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { avatarInitial } from "@/lib/utils";
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

export default function UserMenu({ email }: { email: string }) {
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
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isLoggingOut}
          nativeButton={false}
          title={email}
          aria-label={email}
          render={
            <Avatar
              size="sm"
              className="cursor-pointer data-disabled:cursor-not-allowed data-disabled:opacity-50"
            >
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
          }
        />
        <DropdownMenuContent align="end">
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
