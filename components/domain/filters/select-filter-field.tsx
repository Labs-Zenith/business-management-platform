"use client";

/**
 * Client wrapper around `components/ui/select.tsx`'s `Select` for the
 * native-GET filter bar in `app/(dashboard)/invoices/page.tsx` (a Server
 * Component `<form method="get">`, previously a plain `<select>`). Unlike
 * `date-filter-field.tsx`'s `DatePicker` wrapper, there is no no-JS
 * progressive-enhancement fallback here — the base `Select` primitive is a
 * Client Component from mount with no plain-HTML equivalent to hydrate from,
 * so this always renders the enhanced control.
 *
 * `Select`'s `name` prop renders a hidden input that carries the value into
 * the surrounding `<form>` on submit — the same mechanism a native
 * `<select name=...>` used. On top of that, this ALSO calls
 * `form.requestSubmit()` on every `onValueChange`, so picking a filter value
 * applies it immediately without relying on the page's separate "Filtrar"
 * button — a strict improvement over the native `<select>` it replaces.
 */

import { useRef } from "react";
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

  function submitParentForm() {
    containerRef.current?.closest("form")?.requestSubmit();
  }

  return (
    <div ref={containerRef}>
      <Select
        items={[{ value: "", label: allLabel }, ...options]}
        name={name}
        defaultValue={defaultValue ?? ""}
        onValueChange={submitParentForm}
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
