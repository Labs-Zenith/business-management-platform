"use client";

/**
 * Lazy-loaded entry point for the customer create/edit dialog, matching
 * `employee-form-dialog.tsx`'s split-wrapper pattern. `ssr:false` is only
 * valid inside a Client Component in the App Router — this thin
 * `"use client"` wrapper is what makes that legal, while keeping the actual
 * (heavier) dialog implementation (`customer-form-dialog-content.tsx`) out of
 * the initial/server bundle.
 *
 * Server Components (e.g. `app/(dashboard)/customers/page.tsx` and
 * `app/(dashboard)/customers/[id]/page.tsx`) import this file directly —
 * never `customer-form-dialog-content.tsx`.
 */

import dynamic from "next/dynamic";

const CustomerFormDialog = dynamic(() => import("./customer-form-dialog-content"), {
  ssr: false,
});

export type {
  CustomerFormDialogCustomer,
  CustomerFormDialogProps,
} from "./customer-form-dialog-content";
export default CustomerFormDialog;
