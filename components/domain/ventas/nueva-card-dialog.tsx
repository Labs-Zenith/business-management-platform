"use client";

/**
 * Lazy-loaded entry point for the "create pipeline card" dialog, matching
 * `customer-form-dialog.tsx`'s split-wrapper pattern (`ssr:false` is only
 * legal inside a Client Component in the App Router). `app/(dashboard)/ventas/page.tsx`
 * (a Server Component) imports this file directly — never
 * `nueva-card-dialog-content.tsx`.
 */

import dynamic from "next/dynamic";

const NuevaCardDialog = dynamic(() => import("./nueva-card-dialog-content"), {
  ssr: false,
});

export type { NuevaCardDialogCustomer, NuevaCardDialogProps } from "./nueva-card-dialog-content";
export default NuevaCardDialog;
