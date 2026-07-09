/**
 * Layout for the `(print)` route group — printable comprobantes only
 * (`app/(print)/invoices/[id]/receipt/page.tsx`,
 * `app/(print)/payments/[id]/receipt/page.tsx`), per `design.md`'s File
 * Layout ("app/(print)/invoices/[id]/receipt/page.tsx (DIAN notice)").
 *
 * Deliberately minimal: no dashboard chrome/nav (unlike `(dashboard)`
 * pages) — just a narrow, centered, print-friendly container. Elements
 * that should never appear on the physical/PDF printout (e.g. the
 * "Imprimir" button) use Tailwind's built-in `print:hidden` variant.
 *
 * `app/layout.tsx` forces `.dark` on `<html>` app-wide, but a printed (or
 * print-preview/PDF) comprobante needs to stay light/high-contrast on
 * paper — it's a physical/PDF document, not a screen UI, and dark
 * backgrounds either waste ink or vanish entirely depending on the
 * printer/viewer. The `light` class here re-scopes every CSS variable back
 * to the light palette for this subtree only (see `.light` in
 * `app/globals.css`), so every existing component (`Card`,
 * `InvoiceStatusBadge`, etc.) renders with its normal light-mode colors
 * without any print-specific component variants.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="light mx-auto flex w-full max-w-2xl flex-1 flex-col bg-background p-6 text-foreground print:p-0">
      {children}
    </div>
  );
}
