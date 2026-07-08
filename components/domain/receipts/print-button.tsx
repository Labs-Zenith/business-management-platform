"use client";

import { Button } from "@/components/ui/button";

/**
 * Triggers the browser's native print dialog. Uses Tailwind's built-in
 * `print:hidden` variant so it never appears on the printed/PDF output
 * itself — only the receipt content does.
 */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      Imprimir
    </Button>
  );
}
