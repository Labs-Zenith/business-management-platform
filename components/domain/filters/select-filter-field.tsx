"use client";

/**
 * Client wrapper around `components/ui/select.tsx`'s `Select` for the
 * native-GET filter bars on the list pages (`app/(dashboard)/invoices`,
 * `/customers`, …) — Server Components whose filters are a plain
 * `<form method="get">`, so the control has to contribute a real form field.
 *
 * Like `date-filter-field.tsx`, this component OWNS the named input: it
 * renders its own `<input type="hidden" name={name}>` and drives `Select` as a
 * controlled component. `Select` deliberately does NOT receive `name` — if it
 * did, base-ui would render a second hidden input under the same key and the
 * value would be submitted twice.
 *
 * Picking a value auto-submits the surrounding form, so a filter applies
 * without a separate click on "Filtrar".
 *
 * WHY THE SUBMIT IS DEFERRED TO AN EFFECT — this is load-bearing, do not
 * inline it back into `onValueChange`. base-ui's `setValue` calls
 * `onValueChange(next)` and only THEN `setValueUnwrapped(next)`
 * (`@base-ui/react/select/root/SelectRoot.js`), and a form is serialized from
 * the DOM at the instant `requestSubmit()` is called. Submitting from inside
 * `onValueChange` therefore captured the PREVIOUS value on every pick: filters
 * never applied, and an applied filter could not be cleared. A passive effect
 * runs after React has committed the render, so by then the hidden input below
 * already carries the new value. Covered by `select-filter-field.test.tsx`,
 * which asserts the submitted `FormData` rather than the rendered options.
 */

import { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectFilterFieldOption = {
  value: string;
  label: string;
};

export type SelectFilterFieldProps = {
  /** Shared id for the `<label htmlFor>` / trigger association. */
  id: string;
  /** The GET query param name this field submits (e.g. `"customerId"`, `"status"`). */
  name: string;
  /** Initial value from the Server Component's already-parsed `searchParams`; `""` means "no filter". */
  defaultValue?: string;
  /** Label shown for the "no filter" (`""`) state — matches the original `<option value="">Todos</option>`. */
  allLabel?: string;
  options: SelectFilterFieldOption[];
};

export function SelectFilterField({ id, name, defaultValue, allLabel = "Todos", options }: SelectFilterFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * `picks` counts user selections rather than tracking "has the value
   * changed": it makes `picks === 0` an exact mount guard (no submit on load
   * or on hydration), and it still fires when the user re-picks the value that
   * is already applied — which a plain value-comparison effect would swallow.
   */
  const [state, setState] = useState({ value: defaultValue ?? "", picks: 0 });

  useEffect(() => {
    if (state.picks === 0) return;
    containerRef.current?.closest("form")?.requestSubmit();
  }, [state.picks]);

  return (
    <div ref={containerRef}>
      {/* The only element carrying `name` — this is what actually submits. */}
      <input type="hidden" name={name} value={state.value} />
      <Select
        items={[{ value: "", label: allLabel }, ...options]}
        value={state.value}
        onValueChange={(next) => setState((prev) => ({ value: (next as string) ?? "", picks: prev.picks + 1 }))}
      >
        <SelectTrigger id={id} className="h-8 w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
