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
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  pending = false,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);

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
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>{cancelLabel}</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
