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
 * Pagination controls for the app's list pages — a CENTERED
 * Anterior/Siguiente pair with the total count centered below it. Replaces
 * the old text-only `Pagina X de Y` line (and an earlier numbered-window
 * variant): plain prev/next is what the app's data tables want, and it never
 * grows unbounded for large lists.
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

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <nav aria-label="Paginación" className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-2">
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
