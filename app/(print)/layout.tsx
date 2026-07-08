/**
 * Layout for the `(print)` route group — printable comprobantes only
 * (`app/(print)/invoices/[id]/receipt/page.tsx`,
 * `app/(print)/payments/[id]/receipt/page.tsx`), per `design.md`'s File
 * Layout ("app/(print)/invoices/[id]/receipt/page.tsx (DIAN notice)").
 *
 * Deliberately minimal: no dashboard chrome/nav (unlike `(dashboard)`
 * pages) — just a narrow, centered, print-friendly container. Elements
 * that should never appear on the physical/PDF printout (e.g. the
 * "Imprimir" button) use the `no-print` class, hidden via `@media print` in
 * `app/globals.css`.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-6 print:p-0">
      {children}
    </div>
  );
}
