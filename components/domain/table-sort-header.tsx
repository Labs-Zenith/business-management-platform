import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { buildSortHref, toggleSort, type Sort, type SortDir } from "@/lib/sort";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A sortable column header: a `<TableHead>` whose label is a `<Link>` to the
 * same page with this column's sort applied.
 *
 * Presentational Server Component, built exactly like
 * `components/domain/table-pagination.tsx` — plain `<Link>` hrefs from a
 * `lib/` href builder, no `"use client"`, no client state. Navigation is a
 * full GET, matching this app's filter-form convention, which also means the
 * sorted view is shareable and survives a refresh.
 *
 * Sorting is two-state: a click on an inactive column applies `firstDir`, and
 * a click on the active column flips it. Text columns pass `firstDir="asc"`
 * and dates/money `"desc"`, so the first click gives the order a user actually
 * wants rather than the alphabetically-first or smallest row.
 */

type TableSortHeaderProps<K extends string> = {
  label: string;
  /** This column's sort token; must be one of the entity sorter's `keys`. */
  sortBy: K;
  /** The sort in effect, already whitelisted by the page. */
  current: Sort<K>;
  /** The entity default — landing back on it omits both params, for a clean URL. */
  defaultSort: Sort<K>;
  /** Direction applied on the first click of this column. Defaults to `"asc"`. */
  firstDir?: SortDir;
  pathname: string;
  params: Record<string, string | undefined>;
  /** Namespaced on pages with more than one table (e.g. `"productsSort"`). */
  sortParam?: string;
  dirParam?: string;
  pageParam?: string;
  /** Mirrors the `className="text-right"` the numeric columns already use. */
  align?: "left" | "right";
  className?: string;
};

export function TableSortHeader<K extends string>({
  label,
  sortBy,
  current,
  defaultSort,
  firstDir = "asc",
  pathname,
  params,
  sortParam = "sort",
  dirParam = "dir",
  pageParam = "page",
  align = "left",
  className,
}: TableSortHeaderProps<K>) {
  const isActive = current.sortBy === sortBy;
  const Icon = !isActive ? ChevronsUpDown : current.sortDir === "asc" ? ArrowUp : ArrowDown;

  const href = buildSortHref(pathname, params, {
    sortParam,
    dirParam,
    pageParam,
    next: toggleSort(sortBy, firstDir, current),
    defaultSort,
  });

  return (
    <TableHead
      // Belongs on the `<th>`; `aria-sort` is not valid on the link itself.
      aria-sort={isActive ? (current.sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "right" && "text-right", className)}
    >
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground",
          "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          // The active column is marked by neutral emphasis over TableHead's
          // muted default, never by the brand green -- that stays reserved for
          // focus and success states (see DESIGN.md).
          isActive ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon aria-hidden="true" className={cn("size-3.5", isActive ? "text-foreground" : "text-muted-foreground/60")} />
        <span className="sr-only">
          {isActive
            ? current.sortDir === "asc"
              ? "Orden ascendente. Cambiar a descendente."
              : "Orden descendente. Cambiar a ascendente."
            : "Sin ordenar. Ordenar por esta columna."}
        </span>
      </Link>
    </TableHead>
  );
}
