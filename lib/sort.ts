/**
 * Shared column-sort helpers for every list page's `<TableSortHeader>`
 * control (`components/domain/table-sort-header.tsx`). The URL half of
 * sorting: parsing `?sort=`/`?dir=` off `searchParams` and building the
 * `href` a header link navigates to.
 *
 * Deliberately dependency-free and separate from `lib/services/sorting.ts`
 * (the comparator half), which the repositories import — this module is only
 * ever touched by pages and presentational components.
 *
 * Mirrors `lib/pagination.ts` in role and shape: same `Record<string, string
 * | undefined>` params bag, same "the default value omits its param for a
 * clean URL" convention that `buildPageHref` applies to page 1.
 */

export type SortDir = "asc" | "desc";

export type Sort<K extends string = string> = {
  sortBy: K;
  sortDir: SortDir;
};

/**
 * Whitelists raw `searchParams` against the columns an entity actually
 * supports. Anything unrecognized falls back — a URL is user input and
 * `sortBy` is used to index a comparator map, so an unchecked value would be
 * an undefined-accessor crash.
 *
 * An unknown COLUMN discards the direction too and returns `fallback`
 * wholesale: `?sort=garbage&dir=asc` means the user is not looking at the
 * column they think they are, so honoring half of their request would render
 * a table sorted by something they never asked for. An unknown DIRECTION on a
 * valid column is a lesser failure (the column is still right), so only the
 * direction falls back.
 */
export function parseSortParams<K extends string>(
  rawSort: string | undefined,
  rawDir: string | undefined,
  allowed: readonly K[],
  fallback: Sort<K>,
): Sort<K> {
  if (rawSort !== undefined && rawSort !== "" && !(allowed as readonly string[]).includes(rawSort)) {
    return fallback;
  }
  const sortBy = rawSort ? (rawSort as K) : fallback.sortBy;
  const sortDir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : fallback.sortDir;
  return { sortBy, sortDir };
}

/**
 * The `(column, direction)` a header click should navigate to. Two-state, not
 * tri-state: clicking a new column applies that column's own `firstDir`
 * (text columns read best ascending, dates and money descending), and
 * clicking the active column flips it. There is no "click again to clear" —
 * a table is always sorted by something, so an unsorted state would just be
 * the entity default under a less obvious name.
 */
export function toggleSort<K extends string>(column: K, firstDir: SortDir, current: Sort<K>): Sort<K> {
  return current.sortBy === column
    ? { sortBy: column, sortDir: current.sortDir === "asc" ? "desc" : "asc" }
    : { sortBy: column, sortDir: firstDir };
}

export type SortHrefOptions<K extends string> = {
  /** Query param carrying the column, e.g. `"sort"` or `"productsSort"`. */
  sortParam: string;
  /** Query param carrying the direction, e.g. `"dir"` or `"productsDir"`. */
  dirParam: string;
  /**
   * Page param to DROP, e.g. `"page"` or `"employeesPage"`. Dropping it is
   * what resets to page 1: page 4 of a name-sorted list holds different rows
   * than page 4 of a total-sorted one, so keeping the number would strand the
   * user on an arbitrary — possibly out-of-range — slice.
   */
  pageParam: string;
  next: Sort<K>;
  /**
   * The entity's default sort. When `next` equals it, both params are omitted
   * entirely — same clean-URL convention as `buildPageHref` omitting page 1.
   */
  defaultSort: Sort<K>;
};

/**
 * Builds a sort header's `href`, preserving the page's live filters in
 * `params` — the same contract as `lib/pagination.ts`'s `buildPageHref` and
 * `lib/export/url.ts`'s `buildExportHref`.
 *
 * Every param except this table's own sort/dir/page keys is copied verbatim.
 * That is what lets `/nomina`'s two independently-sorted tables coexist:
 * sorting Empleados carries `paymentsPage`/`paymentsSort`/`paymentsDir` and
 * `tab` through untouched.
 */
export function buildSortHref<K extends string>(
  pathname: string,
  params: Record<string, string | undefined>,
  options: SortHrefOptions<K>,
): string {
  const { sortParam, dirParam, pageParam, next, defaultSort } = options;
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (key === sortParam || key === dirParam || key === pageParam) continue;
    qs.set(key, value);
  }

  if (next.sortBy !== defaultSort.sortBy || next.sortDir !== defaultSort.sortDir) {
    qs.set(sortParam, next.sortBy);
    qs.set(dirParam, next.sortDir);
  }

  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}
