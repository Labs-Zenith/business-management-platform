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
 * Pagination controls for the app's list pages — a CENTERED row with
 * Anterior/Siguiente around a compact page-number window (the current page is
 * highlighted so you can see where you are), and the total count on a line
 * below. Replaces the old text-only `Pagina X de Y` line.
 *
 * The page-number window is `hidden` on mobile (where the below line's
 * `Página X de Y` already conveys position); it appears from `sm` up.
 *
 * Presentational Server Component: each control is a plain `<Link>` built via
 * `buildPageHref` (mirrors `ExportMenu`'s `buildExportHref` usage), so this
 * needs no `"use client"` and no client state — navigation is a full GET,
 * matching this app's filter-form convention (see `customers/page.tsx`).
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
    return <p className="text-center text-sm text-muted-foreground">{countText}</p>;
  }

  const pageNumbers = getPageWindow(page, totalPages);
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <nav aria-label="Paginación" className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-1">
        {isFirstPage ? (
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50 pointer-events-none")}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </span>
        ) : (
          <Link
            href={buildPageHref(pathname, params, paramName, page - 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft className="size-4" />
            Anterior
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
                className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "ring-2 ring-ring")}
              >
                {entry}
              </span>
            ) : (
              <Link
                key={entry}
                href={buildPageHref(pathname, params, paramName, entry)}
                className={buttonVariants({ variant: "outline", size: "icon-sm" })}
              >
                {entry}
              </Link>
            ),
          )}
        </div>

        {isLastPage ? (
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50 pointer-events-none")}
          >
            Siguiente
            <ChevronRight className="size-4" />
          </span>
        ) : (
          <Link
            href={buildPageHref(pathname, params, paramName, page + 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Siguiente
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Página {page} de {totalPages} · {countText}
      </p>
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
