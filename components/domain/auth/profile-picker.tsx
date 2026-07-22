"use client";

/**
 * Rendered by `app/(auth)/login/page.tsx`'s server gate INSTEAD OF
 * `<LoginForm>` when this device already has one or more saved accounts
 * (`getSavedAccounts()`, backed by the httpOnly `saved_accounts` cookie — see
 * `lib/session.ts`) and the visitor did not explicitly ask to add a new one
 * (`?add=1`). Lets an already-known user re-enter with one click instead of
 * retyping credentials, mirroring `components/layout/business-switcher.tsx`'s
 * "Otras cuentas" section (same `POST /api/auth/switch-account { userId }`
 * call, same hard-navigation-on-success rationale, same error handling
 * shape) but as the PRIMARY `/login` experience rather than a sidebar panel.
 *
 * No refresh token or secret ever reaches this component — `SavedAccount`
 * only carries `{userId, email, label, active}` (see `lib/services/ports.ts`).
 */

import { useState } from "react";
import type { SavedAccount } from "@/lib/services/ports";
import { MAX_SAVED_ACCOUNTS } from "@/lib/auth/saved-accounts";
import { avatarInitial } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ACCOUNT_ERROR_MESSAGE = "No se pudo entrar a ese perfil. Inicia sesión de nuevo.";
const REMOVE_ERROR_MESSAGE = "No se pudo eliminar ese perfil. Intenta de nuevo.";

type ProfilePickerProps = {
  accounts: SavedAccount[];
  next?: string;
};

export default function ProfilePicker({ accounts, next }: ProfilePickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const isSwitching = switchingUserId !== null;
  const isRemoving = removingUserId !== null;
  const addAccountHref = next ? `/login?add=1&next=${encodeURIComponent(next)}` : "/login?add=1";

  async function handleSelectAccount(userId: string) {
    if (isSwitching) return;
    setError(null);
    setSwitchingUserId(userId);
    try {
      const response = await fetch("/api/auth/switch-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        setError(ACCOUNT_ERROR_MESSAGE);
        setSwitchingUserId(null);
        return;
      }
      // Hard navigation, NOT `router.refresh()` — mirrors
      // `business-switcher.tsx`'s `post()`: a full-document navigation
      // discards the entire client router cache so every route re-fetches
      // scoped to the newly-active account.
      window.location.assign(next ?? "/dashboard");
    } catch {
      setError(ACCOUNT_ERROR_MESSAGE);
      setSwitchingUserId(null);
    }
  }

  /**
   * Part 1f — removes a saved profile from this device via `POST
   * /api/auth/remove-account`. On success, reloads the page: the server gate
   * (`app/(auth)/login/page.tsx`) re-reads `saved_accounts` fresh, so if this
   * was the last saved profile the plain `<LoginForm>` renders instead.
   */
  async function handleRemoveAccount(userId: string) {
    if (isRemoving) return;
    setError(null);
    setRemovingUserId(userId);
    try {
      const response = await fetch("/api/auth/remove-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        setError(REMOVE_ERROR_MESSAGE);
        setRemovingUserId(null);
        return;
      }
      window.location.reload();
    } catch {
      setError(REMOVE_ERROR_MESSAGE);
      setRemovingUserId(null);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Building2 className="size-4" />
            </div>
            <span className="text-sm font-medium">Panel de negocio</span>
          </div>
          <CardTitle>Elige un perfil</CardTitle>
          <CardDescription>Selecciona la cuenta con la que quieres continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1">
            {accounts.map((account) => (
              <div key={account.userId} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isSwitching || isRemoving}
                  onClick={() => handleSelectAccount(account.userId)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Avatar size="sm" className="shrink-0">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                      {avatarInitial(account.label || account.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">
                    {account.label || account.email}
                  </span>
                  {account.active ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {switchingUserId === account.userId ? "Entrando..." : "Activa"}
                    </span>
                  ) : switchingUserId === account.userId ? (
                    <span className="shrink-0 text-xs text-muted-foreground">Entrando...</span>
                  ) : null}
                </button>
                {/* Sibling of (NOT nested in) the select button above, so
                    clicking the trash never triggers `handleSelectAccount`. */}
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Eliminar perfil de ${account.label || account.email}`}
                      disabled={isSwitching || isRemoving}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  }
                  title="¿Eliminar este perfil guardado?"
                  description="Se quitará de este dispositivo; podrás volver a agregarlo iniciando sesión."
                  onConfirm={() => handleRemoveAccount(account.userId)}
                  pending={removingUserId === account.userId}
                />
              </div>
            ))}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {accounts.length >= MAX_SAVED_ACCOUNTS ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Máximo 2 cuentas guardadas. Elimina una para agregar otra.
              </p>
            ) : (
              <a
                href={addAccountHref}
                className="mt-3 text-center text-sm font-medium text-primary hover:underline"
              >
                Usar otra cuenta
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
