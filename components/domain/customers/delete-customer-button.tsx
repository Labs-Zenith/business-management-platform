"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * "Eliminar cliente" action, used in two places: the Acciones cell of
 * `app/(dashboard)/customers/page.tsx`'s list (icon-only, refresh in place)
 * and the header of `app/(dashboard)/customers/[id]/page.tsx` (labelled,
 * `redirectTo="/customers"` — staying on the detail page of a customer that
 * no longer exists would 404 on refresh).
 *
 * `redirectTo` is a plain string rather than an `onDeleted` callback because
 * the caller is a Server Component and cannot send a closure across the RSC
 * boundary.
 *
 * A customer with any invoice or payment is REFUSED with a `CONFLICT` naming
 * the counts; the dialog then offers "Desactivar" instead, which PATCHes
 * `isActive: false`. Same shape as `delete-product-button.tsx` — see its doc
 * comment for the shared reasoning. Only rendered for roles holding
 * `deleteRecords`; the real gate is `requireCapability` on
 * `DELETE /api/customers/{id}`.
 */

const DELETE_ERROR_MESSAGE = "No se pudo eliminar el cliente. Intenta de nuevo.";
const DEACTIVATE_ERROR_MESSAGE = "No se pudo desactivar el cliente. Intenta de nuevo.";

export type DeleteCustomerButtonProps = {
  customerId: string;
  customerName: string;
  /** Drives whether "Desactivar" is worth offering when the delete is refused. */
  customerActive: boolean;
  /** Navigated to on success. Omitted on the list page, which refreshes in place. */
  redirectTo?: string;
};

export default function DeleteCustomerButton({
  customerId,
  customerName,
  customerActive,
  redirectTo,
}: DeleteCustomerButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canDeactivate, setCanDeactivate] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setError(null);
      setCanDeactivate(false);
    }
  }

  /** Both success paths land here: leave the detail page, or refresh the list. */
  function finish() {
    setOpen(false);
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.refresh();
    }
  }

  async function handleDelete() {
    setIsPending(true);
    setError(null);
    try {
      // `content-type` is REQUIRED even with no body — see
      // `lib/server/origin-check.ts#checkOrigin`'s anti-CSRF gate. Without it
      // every delete fails with a 400 "Content-Type must be application/json."
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });

      if (!response.ok) {
        const body: { error?: { code?: string; message?: string } } | null = await response
          .json()
          .catch(() => null);
        setError(body?.error?.message ?? DELETE_ERROR_MESSAGE);
        setCanDeactivate(body?.error?.code === "CONFLICT" && customerActive);
        return;
      }

      finish();
    } catch {
      setError(DELETE_ERROR_MESSAGE);
    } finally {
      setIsPending(false);
    }
  }

  async function handleDeactivate() {
    setIsPending(true);
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setError(body?.error?.message ?? DEACTIVATE_ERROR_MESSAGE);
        return;
      }

      // Deactivating does NOT remove the customer, so the detail page stays
      // valid — refresh in place instead of navigating away.
      setOpen(false);
      router.refresh();
    } catch {
      setError(DEACTIVATE_ERROR_MESSAGE);
    } finally {
      setIsPending(false);
    }
  }

  const trigger = redirectTo ? (
    <Button
      variant="outline"
      aria-label={`Eliminar ${customerName}`}
      className="w-full text-destructive hover:text-destructive sm:w-auto"
    >
      <Trash2 className="size-4" />
      Eliminar
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Eliminar ${customerName}`}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 />
    </Button>
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title="¿Eliminar este cliente?"
      description="Esta acción no se puede deshacer. Un cliente con facturas o pagos registrados no se puede eliminar; en ese caso podrás desactivarlo."
      pending={isPending}
      error={error}
      recoveryAction={canDeactivate ? { label: "Desactivar", onAction: handleDeactivate } : undefined}
      onConfirm={handleDelete}
    />
  );
}
