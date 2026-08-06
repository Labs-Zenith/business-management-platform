"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Anular factura" — the logical deletion for an invoice created by mistake.
 * Rendered on the invoice detail page, and only for a role holding
 * `voidInvoice`; the enforcing gate is `requireCapability` on
 * `POST /api/invoices/{id}/void`.
 *
 * NOT built on `ConfirmDialog`: that primitive takes no input, and the reason
 * here is mandatory. Composed from the same `Dialog` primitives instead,
 * following `card-detail-dialog-content.tsx`'s form-in-a-dialog shape, with
 * the codebase's usual inline `role="alert"` error surface rather than a
 * toast.
 *
 * Submit stays disabled until a non-blank reason is typed — the server
 * re-checks it after trimming, so this is only an affordance.
 */

const GENERIC_ERROR_MESSAGE = "No se pudo anular la factura. Intenta de nuevo.";

export type VoidInvoiceDialogProps = {
  invoiceId: string;
  invoiceNumber: string;
};

export default function VoidInvoiceDialog({ invoiceId, invoiceNumber }: VoidInvoiceDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = reason.trim().length > 0 && !isSubmitting;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    // Reopening starts clean rather than showing the previous attempt.
    if (nextOpen) {
      setReason("");
      setError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        // The server's message is the useful one here — it names the invoice
        // count, or explains that the returned units are no longer in stock.
        setError(body?.error?.message ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" className="w-full text-destructive hover:text-destructive sm:w-auto">
            <Ban className="size-4" />
            Anular factura
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Anular la factura {invoiceNumber}?</DialogTitle>
          <DialogDescription>
            Se devolverá el inventario que descontó y se anularán sus pagos, así que dejará de contar en el
            saldo del cliente y en el dashboard. La factura no se borra: queda marcada como anulada. Esta
            acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="void-reason">Motivo</Label>
            <Textarea
              id="void-reason"
              required
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Por ejemplo: se facturó al cliente equivocado"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={isSubmitting} />}>
              Cancelar
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={!canSubmit}>
              {isSubmitting ? "Anulando..." : "Anular factura"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
