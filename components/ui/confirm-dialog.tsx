"use client";

import type { ReactElement } from "react";
import { useState } from "react";
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

/**
 * Part 1e — reusable confirmation modal composed from the existing generic
 * `Dialog` primitives (`components/ui/dialog.tsx`) + `Button
 * variant="destructive"` (see `DESIGN.md`'s Badge/Button variant table).
 * First consumer: `components/domain/auth/profile-picker.tsx`'s per-row
 * "delete saved profile" trash icon (Part 1f).
 *
 * `trigger` is wired through `DialogTrigger`'s `render` prop so the caller's
 * own element (e.g. an icon `Button`) becomes the actual interactive trigger
 * — no extra wrapping button, avoiding invalid nested-button markup.
 *
 * `open`/`onOpenChange` and `error` are OPTIONAL additions for the row-level
 * delete buttons (`delete-product-button.tsx`, `delete-customer-button.tsx`).
 * Those live directly in a table cell with no surrounding dialog to unmount,
 * so — unlike `card-detail-dialog-content.tsx`, where closing the parent
 * dialog takes this one with it — they need to drive `open` themselves to
 * close after a successful async `onConfirm`, and to keep it OPEN while
 * showing why a delete was refused. Omitting both keeps the original
 * self-managed behavior, so the pre-existing consumers are untouched.
 */
export type ConfirmDialogProps = {
  /** Rendered as the dialog's trigger (e.g. a `Trash2` icon button). */
  trigger: ReactElement;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
  /** Controlled open state; falls back to internal state when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Inline failure message, rendered between the description and the footer.
   * Uses the same `role="alert"` convention as every other error surface in
   * the app (this codebase never uses toasts for form/mutation errors).
   */
  error?: string | null;
  /**
   * Optional way forward offered ONLY once `error` is showing, replacing the
   * (now pointless) confirm button. The delete buttons use it to turn a
   * refusal into one click: "no se puede eliminar… Desactívalo en su lugar"
   * followed by an actual "Desactivar" button, rather than making the user
   * close the dialog and hunt for the toggle in the edit form.
   */
  recoveryAction?: { label: string; onAction: () => void | Promise<void> };
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  pending = false,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  error = null,
  recoveryAction,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;

  async function handleConfirm() {
    await onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>{cancelLabel}</DialogClose>
          {/* Once the action has been refused, retrying it verbatim can only
              fail again — so the destructive button gives way to the recovery
              action when one is offered.

              The `key`s are load-bearing: without them React reuses the same
              <button> node across the swap, and `transition-all` then CROSS-
              FADES the destructive red into the primary fill — the recovery
              button visibly starts out looking destructive. Distinct keys
              force a fresh node, so it renders in its own colour from frame
              one. */}
          {error && recoveryAction ? (
            <Button key="recovery" variant="default" disabled={pending} onClick={() => recoveryAction.onAction()}>
              {recoveryAction.label}
            </Button>
          ) : (
            <Button key="confirm" variant="destructive" disabled={pending} onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
