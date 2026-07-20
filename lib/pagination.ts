/**
 * Shared pagination helpers used by every list page's `<TablePagination>`
 * control (`components/domain/table-pagination.tsx`). Centralizes what used
 * to be a `parsePageParam` copy duplicated per-file in
 * `customers/invoices/payments/egresos`'s `page.tsx`.
 */

export function parsePageParam(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Builds an `href` for a page link, preserving the current filters in
 * `params` — mirrors `lib/export/url.ts`'s `buildExportHref`, the
 * established pattern for links that keep the page's live filters. `page`
 * is written under `paramName` (default call sites use `"page"`;
 * inventario/nomina use `"productsPage"`/`"movementsPage"`/
 * `"employeesPage"`/`"paymentsPage"` since each tab paginates
 * independently). Page 1 omits `paramName` entirely for clean URLs.
 */
export function buildPageHref(
  pathname: string,
  params: Record<string, string | undefined>,
  paramName: string,
  page: number,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && key !== paramName) {
      qs.set(key, value);
    }
  }
  if (page !== 1) {
    qs.set(paramName, String(page));
  }
  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}
