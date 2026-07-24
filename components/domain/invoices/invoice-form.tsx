"use client";

/**
 * Lazy-loaded entry point for the invoice create/edit form, per the user's
 * explicit lazy-loading requirement — the invoice item fields (dynamic
 * add/remove via `react-hook-form`'s `useFieldArray`) are the heaviest
 * interactive piece of this change. `ssr:false` is only valid inside a
 * Client Component in the App Router — this thin `"use client"` wrapper is
 * what makes that legal, while keeping `react-hook-form`/`@hookform/resolvers`
 * and the actual (heavier) form implementation
 * (`invoice-form-content.tsx`) out of the initial/server bundle. Same
 * split-wrapper pattern as PR4's `customer-form-dialog.tsx`.
 *
 * Server Components (e.g. `app/(dashboard)/invoices/new/page.tsx` and
 * `app/(dashboard)/invoices/[id]/edit/page.tsx`) import this file directly —
 * never `invoice-form-content.tsx`. Passing the optional `invoice` prop
 * switches the underlying form into edit mode (pre-fill + PATCH); see
 * `invoice-form-content.tsx`'s doc comment.
 */

import dynamic from "next/dynamic";

const InvoiceForm = dynamic(() => import("./invoice-form-content"), {
  ssr: false,
});

export type {
  InvoiceFormContentProps as InvoiceFormProps,
  InvoiceFormCustomer,
  InvoiceFormContentInvoice,
  InvoiceFormInvoiceType,
  InvoiceFormProduct,
} from "./invoice-form-content";
export default InvoiceForm;
