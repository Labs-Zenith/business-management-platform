import Link from "next/link";
import { ChevronDownIcon, Download } from "lucide-react";
import { buildExportHref } from "@/lib/export/url";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ExportMenuProps = {
  path: string;
  params: Record<string, string | undefined>;
};

/**
 * Shared "Exportar" dropdown trigger used by every list page that offers
 * Excel/PDF export (dashboard, invoices, payments, ...). Generalizes what
 * used to be `DashboardExportMenu` (dashboard-only) so every page composes
 * the same single trigger instead of separate "Excel"/"PDF" `<Button>`s.
 * Mirrors `components/layout/business-switcher.tsx` — the only other
 * "one button -> dropdown -> pick an option" pattern in the app — for the
 * `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/
 * `DropdownMenuItem` structure and `align="end"` positioning.
 *
 * The trigger composes the shared `Button` primitive via `DropdownMenuTrigger`'s
 * polymorphic `render` prop (the same "outer component injects its own
 * a11y/behavior props onto the given element" pattern already used for
 * `Button` + `Link` elsewhere in this codebase), so the trigger keeps the
 * exact `variant="outline"` look the buttons it replaces had.
 *
 * Both menu items are static `<Link>`s built via
 * `buildExportHref(path, params, format)` — `path` is the page's export API
 * route and `params` are that page's live filters, forwarded through
 * unchanged. Because the links are fully static per render, this component
 * needs no client state and stays a Server-Component-friendly file (no
 * `"use client"` directive): the `DropdownMenu` primitives it composes are
 * already client components (`components/ui/dropdown-menu.tsx` declares
 * `"use client"` itself).
 */
export function ExportMenu({ path, params }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // `data-slot` is set EXPLICITLY here, and must stay. Without it this
          // trigger hydration-mismatches: base-ui merges `render.props` LAST
          // (`useRenderElement`'s `mergeProps(props, render.props)`), while
          // `Button` spreads incoming props last too (`components/ui/button.tsx`).
          // In a Server Component the `<Button>` element is evaluated during RSC
          // serialization, so `data-slot="button"` is already inside
          // `render.props` and wins server-side; on the client base-ui's own
          // `data-slot="dropdown-menu-trigger"` reaches Button as an incoming
          // prop and wins instead. Writing the value literally makes both paths
          // agree. Same fix as `components/ui/date-picker.tsx`'s popover trigger.
          <Button variant="outline" data-slot="dropdown-menu-trigger" className="w-full sm:w-auto">
            <Download className="size-4" />
            Exportar
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          nativeButton={false}
          render={<Link href={buildExportHref(path, params, "xlsx")} />}
        >
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          nativeButton={false}
          render={<Link href={buildExportHref(path, params, "pdf")} />}
        >
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
