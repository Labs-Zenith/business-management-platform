"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Row-level "eliminar producto" action for `app/(dashboard)/inventario/
 * page.tsx`'s Acciones cell, sitting next to the existing "Editar"
 * `ProductFormDialog`. Only rendered when the session's role holds the
 * `deleteRecords` capability — that check happens server-side in the page;
 * the real gate is `requireCapability("deleteRecords")` on
 * `DELETE /api/products/{id}`.
 *
 * A product that has been invoiced is REFUSED with a `CONFLICT` (billing
 * history is never destroyed by a catalog edit). Rather than leaving the user
 * at a dead end, the dialog then offers "Desactivar" — the non-destructive
 * alternative the refusal message names — which PATCHes `active: false` and
 * takes the product out of the invoice product picker. That offer is skipped
 * when the product is already inactive, since it would be a no-op.
 *
 * Mirrors `components/domain/auth/profile-picker.tsx`'s trash-icon +
 * `ConfirmDialog` pattern, and `card-detail-dialog-content.tsx`'s fetch/error
 * handling (parse `body.error.message`, render inline, never a toast). Unlike
 * the latter there is no parent dialog to unmount on success, so `open` is
 * driven here — see `ConfirmDialog`'s doc comment.
 */

const DELETE_ERROR_MESSAGE = "No se pudo eliminar el producto. Intenta de nuevo.";
const DEACTIVATE_ERROR_MESSAGE = "No se pudo desactivar el producto. Intenta de nuevo.";

export type DeleteProductButtonProps = {
  productId: string;
  productName: string;
  /** Drives whether "Desactivar" is worth offering when the delete is refused. */
  productActive: boolean;
};

export default function DeleteProductButton({
  productId,
  productName,
  productActive,
}: DeleteProductButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only a CONFLICT means "this can never be deleted, but CAN be deactivated".
  // A 403/500/network error is a different problem, and offering Desactivar
  // there would be misleading.
  const [canDeactivate, setCanDeactivate] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    // Reopening after a failure should start clean, not show the stale error.
    if (nextOpen) {
      setError(null);
      setCanDeactivate(false);
    }
  }

  async function handleDelete() {
    setIsPending(true);
    setError(null);
    try {
      // The `content-type` header is REQUIRED even though there is no body:
      // `lib/server/origin-check.ts#checkOrigin` rejects any mutation without
      // it (anti-CSRF — `application/json` forces a preflight, which a
      // cross-origin form post cannot produce). Omitting it fails with a 400
      // "Content-Type must be application/json." every time.
      const response = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });

      if (!response.ok) {
        const body: { error?: { code?: string; message?: string } } | null = await response
          .json()
          .catch(() => null);
        setError(body?.error?.message ?? DELETE_ERROR_MESSAGE);
        setCanDeactivate(body?.error?.code === "CONFLICT" && productActive);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError(DELETE_ERROR_MESSAGE);
    } finally {
      setIsPending(false);
    }
  }

  async function handleDeactivate() {
    setIsPending(true);
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? DEACTIVATE_ERROR_MESSAGE);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError(DEACTIVATE_ERROR_MESSAGE);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Eliminar ${productName}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      }
      title="¿Eliminar este producto?"
      description="Esta acción no se puede deshacer. Un producto que ya aparece en alguna factura no se puede eliminar; en ese caso podrás desactivarlo."
      pending={isPending}
      error={error}
      recoveryAction={canDeactivate ? { label: "Desactivar", onAction: handleDeactivate } : undefined}
      onConfirm={handleDelete}
    />
  );
}
