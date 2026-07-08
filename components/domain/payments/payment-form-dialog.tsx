"use client";

/**
 * Lazy-loaded entry point for the "Registrar pago" dialog, per the user's
 * explicit lazy-loading requirement (`design.md`'s "Skeleton vs dynamic"
 * section: "dynamic ssr:false: ... payment/customer form dialogs").
 * `ssr:false` is only valid inside a Client Component in the App Router —
 * this thin `"use client"` wrapper is what makes that legal, while keeping
 * the actual (heavier) dialog implementation
 * (`payment-form-dialog-content.tsx`) out of the initial/server bundle. Same
 * split-wrapper pattern as `components/domain/customers/customer-form-dialog.tsx`
 * (PR4) and `components/domain/invoices/invoice-form.tsx` (PR5).
 *
 * Server Components (e.g. `app/(dashboard)/invoices/[id]/page.tsx`) import
 * this file directly — never `payment-form-dialog-content.tsx`.
 */

import dynamic from "next/dynamic";

const PaymentFormDialog = dynamic(() => import("./payment-form-dialog-content"), {
  ssr: false,
});

export type { PaymentFormDialogProps } from "./payment-form-dialog-content";
export default PaymentFormDialog;
