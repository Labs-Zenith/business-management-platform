"use client";

import { useMemo } from "react";
import type { ZodType } from "zod";

/**
 * Live (as-you-type) form validation against an existing Zod schema
 * (`lib/schemas/*`). Given the schema and the form's CURRENT values, derives:
 *   - `errors`: the first error message per top-level field (keyed by the
 *     field name, i.e. `issue.path[0]`), for inline rendering.
 *   - `isValid`: whether the whole form currently passes the schema (use it to
 *     disable the submit button until valid).
 *
 * Forms own their own `touched` state and should render an inline error only
 * when `touched[field] && errors[field]`, so a pristine field isn't shown as
 * invalid before the user has interacted with it. Recomputed via `useMemo`
 * keyed on `values`, so it re-validates on every keystroke without extra
 * plumbing.
 *
 * Messages come straight from the domain schema, keeping a single source of
 * truth for validation rules between the client (live UX) and the server
 * (the API route's `safeParse`).
 */
export function useZodForm<T>(
  schema: ZodType<T>,
  values: unknown
): { errors: Partial<Record<string, string>>; isValid: boolean } {
  return useMemo(() => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { errors: {}, isValid: true };
    }
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && errors[key] === undefined) {
        errors[key] = issue.message;
      }
    }
    return { errors, isValid: false };
  }, [schema, values]);
}
