import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { buildExportHref } from "@/lib/export/url";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Replaces the dashboard header's previous separate "Excel"/"PDF" export
 * `<Button>` pair with a single "Exportar" trigger that opens a dropdown to
 * pick the format. Mirrors `components/layout/business-switcher.tsx` — the
 * only other "one button -> dropdown -> pick an option" pattern in the
 * app — for the `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/
 * `DropdownMenuItem` structure and `align="end"` positioning.
 *
 * The trigger composes the shared `Button` primitive via `DropdownMenuTrigger`'s
 * polymorphic `render` prop (the same "outer component injects its own
 * a11y/behavior props onto the given element" pattern already used for
 * `Button` + `Link` elsewhere in this codebase), so the trigger keeps the
 * exact `variant="outline"` look the two buttons it replaces had.
 *
 * Both menu items are static `<Link>`s built via
 * `buildExportHref("/api/dashboard/export", {}, format)`, exactly like the
 * buttons they replace — the dashboard export has no query-string filters to
 * forward. Because of that, this component needs no client state and stays
 * a Server-Component-friendly file (no `"use client"` directive): the
 * `DropdownMenu` primitives it composes are already client components
 * (`components/ui/dropdown-menu.tsx` declares `"use client"` itself), the
 * same way `app/(dashboard)/dashboard/page.tsx` composes the client `<Tabs>`
 * shell without needing `"use client"` itself.
 */
export function DashboardExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="w-full sm:w-auto">
            Exportar
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          nativeButton={false}
          render={<Link href={buildExportHref("/api/dashboard/export", {}, "xlsx")} />}
        >
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          nativeButton={false}
          render={<Link href={buildExportHref("/api/dashboard/export", {}, "pdf")} />}
        >
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
