"use client";

/**
 * Lazy-loaded entry point for the "Crear gasto" dialog, per the user's
 * explicit lazy-loading requirement (`design.md`'s "Skeleton vs dynamic"
 * section: "dynamic ssr:false: ... payment/customer form dialogs").
 * `ssr:false` is only valid inside a Client Component in the App Router —
 * this thin `"use client"` wrapper is what makes that legal, while keeping
 * the actual (heavier) dialog implementation
 * (`expense-form-dialog-content.tsx`) out of the initial/server bundle. Same
 * split-wrapper pattern as `components/domain/customers/customer-form-dialog.tsx`
 * and `components/domain/payments/payment-form-dialog.tsx`.
 *
 * Server Components (e.g. `app/(dashboard)/dashboard/page.tsx`) import this
 * file directly — never `expense-form-dialog-content.tsx`.
 */

import dynamic from "next/dynamic";

const ExpenseFormDialog = dynamic(() => import("./expense-form-dialog-content"), {
  ssr: false,
});

export type { ExpenseFormDialogProps } from "./expense-form-dialog-content";
export default ExpenseFormDialog;
