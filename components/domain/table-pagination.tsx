import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildPageHref } from "@/lib/pagination";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
  params: Record<string, string | undefined>;
  /** Query param that carries the page number. Defaults to `"page"`; the
   * inventario/nomina tab-scoped tables pass `"productsPage"` /
   * `"movementsPage"` / `"employeesPage"` / `"paymentsPage"` so each table
   * paginates independently. */
  paramName?: string;
  /** Noun used in the trailing count text, e.g. `"clientes"`. */
  itemLabel?: string;
};

/**
 * Real pagination controls (Anterior/Siguiente + a compact page-number
 * window) for the app's list pages — replaces the old text-only
 * `Pagina X de Y` line. Presentational Server Component: every control is a
 * plain `<Link>` built via `buildPageHref` (mirrors `ExportMenu`'s
 * `buildExportHref` usage), so this needs no `"use client"` directive and no
 * client state — navigation is a full GET, matching this app's filter-form
 * convention (`docs/... ` — see `customers/page.tsx`).
 *
 * Page-number window: first, last, and current±1, deduped, with `…` filling
 * any gap — a fixed 3-4 item window regardless of `totalPages` so the
 * control never grows unbounded for large lists.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  pathname,
  params,
  paramName = "page",
  itemLabel = "resultados",
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const countText = `${total} ${itemLabel}`;

  if (totalPages <= 1) {
    return <p className="text-sm text-muted-foreground">{countText}</p>;
  }

  const pageNumbers = getPageWindow(page, totalPages);
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        {isFirstPage ? (
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "opacity-50 pointer-events-none")}
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">Anterior</span>
          </span>
        ) : (
          <Link
            href={buildPageHref(pathname, params, paramName, page - 1)}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">Anterior</span>
          </Link>
        )}

        <div className="hidden items-center gap-1 sm:flex">
          {pageNumbers.map((entry, index) =>
            entry === "ellipsis" ? (
              <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-sm text-muted-foreground">
                …
              </span>
            ) : entry === page ? (
              <span
                key={entry}
                aria-current="page"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ring-2 ring-ring")}
              >
                {entry}
              </span>
            ) : (
              <Link
                key={entry}
                href={buildPageHref(pathname, params, paramName, entry)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {entry}
              </Link>
            ),
          )}
        </div>

        <span className="px-2 text-sm text-muted-foreground sm:hidden">
          {page} / {totalPages}
        </span>

        {isLastPage ? (
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "opacity-50 pointer-events-none")}
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">Siguiente</span>
          </span>
        ) : (
          <Link
            href={buildPageHref(pathname, params, paramName, page + 1)}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">Siguiente</span>
          </Link>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{countText}</p>
    </nav>
  );
}

/**
 * Builds the compact page-number window: 1, `totalPages`, and `page - 1` /
 * `page` / `page + 1` (clamped to range), deduped and sorted, with an
 * `"ellipsis"` sentinel inserted for any gap wider than 1 between
 * consecutive entries.
 */
function getPageWindow(page: number, totalPages: number): Array<number | "ellipsis"> {
  const raw = new Set<number>([1, totalPages]);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= totalPages) {
      raw.add(p);
    }
  }
  const sorted = Array.from(raw).sort((a, b) => a - b);

  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("ellipsis");
    }
    result.push(sorted[i]);
  }
  return result;
}
