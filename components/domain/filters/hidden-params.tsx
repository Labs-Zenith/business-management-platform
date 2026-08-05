/**
 * Re-declares the search params a filter form must carry through its own
 * submit.
 *
 * A native `<form method="get">` submit REPLACES the entire query string with
 * that form's fields — anything not present as an input is silently dropped.
 * Every list page's filter bar is such a form, so any param the page reads but
 * does not render a control for has to be echoed back here or it vanishes the
 * first time the user filters. That is exactly how `/payments` lost its
 * `customerId`/`invoiceId` scope, and how sorting would be reset by filtering.
 *
 * Never pass the page param. Filtering SHOULD reset to page 1, since page 4 of
 * an unfiltered list holds different rows than page 4 of a filtered one.
 *
 * Presentational Server Component — plain inputs, no state, no `"use client"`.
 */
export function HiddenParams({ params }: { params: Record<string, string | undefined> }) {
  return (
    <>
      {Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
    </>
  );
}
