"use client";

/**
 * Progressive-enhancement date filter field for the native-GET filter bars in
 * `app/(dashboard)/invoices/page.tsx` and `app/(dashboard)/payments/page.tsx`
 * (both Server Components submitting a plain `<form method="get">`, with no
 * client JS on the page otherwise). Per `openspec/changes/datepicker-rollout`'s
 * design.md ("PR4b — Native-GET filter-bar islands"):
 *
 * - Pre-mount (and therefore SSR / no-JS) render: a plain, fully functional
 *   `<input type="date" name={name}>` — the form still submits via GET with
 *   zero JS, exactly as it did before this change.
 * - Post-mount render (after the `useEffect` below flips `mounted` to
 *   `true`): swaps to a hidden `<input type="hidden" name={name}>` (the value
 *   that actually gets submitted) plus the `DatePicker` UI, which writes into
 *   that hidden input via local state.
 *
 * CRITICAL — hydration-safety: the FIRST client render must be byte-for-byte
 * identical to the SSR render. `mounted` comes from `useSyncExternalStore`
 * (`getServerSnapshot` returns `false`, matching the server render and the
 * client's first/hydrating render; `getSnapshot` returns `true` on every
 * later client render), NOT a `useState` flipped inside a `useEffect` body —
 * synchronously calling `setState` from an effect is exactly the "cascading
 * renders" anti-pattern `eslint-plugin-react-hooks`'s
 * `set-state-in-effect` rule flags, and `useSyncExternalStore` is the
 * pattern React itself documents for this "differs only after hydration"
 * case (see https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
 * Because the client's very first render also uses `getServerSnapshot`
 * (`false`), the `else` branch below (the native `<input type="date">`) is
 * what renders in both places, and React sees no mismatch; only after
 * hydration commits does React re-check `getSnapshot` and swap to `true`.
 * Only ONE of the two inputs ever carries the `name` attribute at a time
 * (the native input pre-mount, the hidden input post-mount), so the form
 * never risks submitting a duplicate `name=...` query param.
 */

import * as React from "react";
import { DatePicker } from "@/components/ui/date-picker";

export type DateFilterFieldProps = {
  /** The GET query param name this field submits (e.g. `"from"`, `"to"`). */
  name: string;
  /** Initial value from the Server Component's already-parsed `searchParams`. */
  defaultValue?: string;
  /** Visible label text (e.g. `"Desde"`, `"Hasta"`). */
  label: string;
  /** Shared id for the `<label htmlFor>` / input association. */
  id: string;
};

// Module-level (stable-reference) `useSyncExternalStore` callbacks — the
// "store" here is simply "has this component's first client commit
// happened yet", which never changes again once true, so `subscribe` never
// needs to invoke its callback.
function subscribeNoop() {
  return () => {};
}
function getClientMountedSnapshot() {
  return true;
}
function getServerMountedSnapshot() {
  return false;
}

export function DateFilterField({ name, defaultValue, label, id }: DateFilterFieldProps) {
  const mounted = React.useSyncExternalStore(
    subscribeNoop,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
  const [value, setValue] = React.useState(defaultValue ?? "");

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      {mounted ? (
        <>
          {/* Carries the value that actually gets submitted once enhanced. */}
          <input type="hidden" name={name} value={value} />
          <DatePicker id={id} value={value} onChange={setValue} />
        </>
      ) : (
        // No-JS / pre-hydration path: a real, submittable native date input —
        // this is the ONLY element carrying `name` at this point.
        <input
          id={id}
          name={name}
          type="date"
          // Pass `defaultValue` through as-is (NOT `defaultValue ?? ""`):
          // React only emits a `value="..."` attribute in the SSR markup
          // when `defaultValue` is a non-nullish string. On a fresh page
          // load (no `from`/`to` query param yet), `defaultValue` is
          // `undefined`, and we want a clean `<input type="date">` with no
          // stray `value=""` attribute — functionally equivalent either
          // way, but this is the tidier/more direct rendering.
          defaultValue={defaultValue}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
        />
      )}
    </div>
  );
}
