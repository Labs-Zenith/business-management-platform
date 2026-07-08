"use client";

/**
 * Lazy-loaded entry point for the invoice create form, per the user's
 * explicit lazy-loading requirement — the invoice item fields (dynamic
 * add/remove via `react-hook-form`'s `useFieldArray`) are the heaviest
 * interactive piece of this change. `ssr:false` is only valid inside a
 * Client Component in the App Router — this thin `"use client"` wrapper is
 * what makes that legal, while keeping `react-hook-form`/`@hookform/resolvers`
 * and the actual (heavier) form implementation
 * (`invoice-form-content.tsx`) out of the initial/server bundle. Same
 * split-wrapper pattern as PR4's `customer-form-dialog.tsx`.
 *
 * Server Components (e.g. `app/(dashboard)/invoices/new/page.tsx`) import
 * this file directly — never `invoice-form-content.tsx`.
 */

import dynamic from "next/dynamic";

const InvoiceForm = dynamic(() => import("./invoice-form-content"), {
  ssr: false,
});

export type { InvoiceFormContentProps as InvoiceFormProps, InvoiceFormCustomer } from "./invoice-form-content";
export default InvoiceForm;
