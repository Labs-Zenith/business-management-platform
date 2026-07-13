"use client";

/**
 * Lazy-loaded entry point for the "Registrar movimiento" dialog, per the
 * user's explicit lazy-loading requirement (mirrors `design.md`'s "Skeleton
 * vs dynamic" section from `nomina-payroll`). `ssr:false` is only valid
 * inside a Client Component in the App Router — this thin `"use client"`
 * wrapper is what makes that legal, while keeping the actual (heavier)
 * dialog implementation (`movement-form-dialog-content.tsx`) out of the
 * initial/server bundle. Same split-wrapper pattern as
 * `components/domain/nomina/payroll-payment-form-dialog.tsx`.
 *
 * Server Components (e.g. `app/(dashboard)/inventario/page.tsx`) import this
 * file directly — never `movement-form-dialog-content.tsx`.
 */

import dynamic from "next/dynamic";

const MovementFormDialog = dynamic(() => import("./movement-form-dialog-content"), {
  ssr: false,
});

export type { MovementFormDialogProduct, MovementFormDialogProps } from "./movement-form-dialog-content";
export default MovementFormDialog;
