# Proposal: Reusable Masked Money/Quantity Input (PR1 — Foundation)

## Intent

7-8 money/quantity form fields across the app default to a numeric `0` that
can't be cleared (typing requires deleting the leading `0` first; some
consumers coerce a blank field back to `0` via `valueAsNumber || 0`), and
none of them format-as-you-type with COP thousands separators. This PR
builds the reusable, testable foundation that fixes both problems —
`MoneyInput` / `QuantityInput` — without migrating any consumer yet
(consumer migration is PR2).

The design generalizes the existing string-state pattern already used by
`components/domain/payments/payment-form-dialog-content.tsx`'s amount field
(controlled `value: string`, `""` when empty, converted with
`Number(v) || 0` only at submit time) and adds as-you-type COP-style
grouping (`.` thousands, `,` decimal) on top of it.

## Decision

- **Masking is pure and framework-free.** All formatting/parsing logic
  lives in `lib/format/numeric-mask.ts` as plain functions with no React
  dependency, so the hardest rules (leading-zero stripping, the
  "`.` is always a grouping artifact, never a decimal point" rule, decimal
  truncation, the in-progress-decimal display case) are unit-tested in
  isolation from rendering concerns.
- **The exchanged value is always a JS-parseable RAW string** — `.` as the
  decimal point, no grouping separators, `""` when empty
  (`Number(raw)` always works, or `raw === ""`). This is what fixes the
  "can't clear the field" bug: there is no internal string state duplicating
  `value`, so `value` can genuinely be `""`.
- **Currency separators are looked up by code, with COP as the universal
  fallback** (`maskOptionsForCurrency`), documented as the seam for future
  currencies rather than a real multi-currency feature today.
- **`MoneyInput` and `QuantityInput` are thin wrappers** over one internal
  masked-input implementation, parametrized by `allowDecimals`/`maxDecimals`.
  Both render through the existing `components/ui/input.tsx` (`type="text"`,
  never `type="number"`, since `number` inputs can't show grouping) so they
  inherit all current styling, and both set `inputMode` (`"decimal"` /
  `"numeric"`) so mobile keeps a numeric keypad — required, not optional,
  since the app is used on mobile.
- **`components/ui/input.tsx` now forwards `ref`** (backward-compatible;
  `React.ComponentProps<"input"> & { ref?: React.Ref<HTMLInputElement> }`),
  which `MoneyInput`/`QuantityInput` need to restore the caret position after
  each keystroke re-render.
- **Both inputs are non-negative by design.** `sanitizeRawInput` strips a
  typed `-` unconditionally — there is no negative-amount/negative-quantity
  mode. Every money/quantity field in this app (invoice line prices,
  expenses, salaries, costs, quantities) is non-negative, and
  `pesosToCents`/downstream money conversions assume `>= 0`. This is a
  deliberate constraint of the contract, not an oversight: if a future
  consumer genuinely needs negative values (e.g. a credit/adjustment field),
  that requires a new opt-in, not a change to this default.
- **Required-field validation must check `raw !== ""`, not `Number(raw) ||
  0`.** Because `Number("") || 0 === 0` and `Number("0") || 0 === 0` are
  indistinguishable, a PR2 consumer that needs a required (non-empty) money
  field must validate presence on the raw string directly — e.g. a zod
  `.refine((v) => v !== "" && Number(v) > 0)` shape — and must NOT rely on
  `Number(v) || 0` to detect "field left empty" (that pattern was exactly
  the bug this PR fixes for display, and it would silently reappear at the
  validation layer if reused there).

## Exposed Contract (for PR2 consumers)

```ts
// lib/format/numeric-mask.ts
export type NumericMaskOptions = {
  allowDecimals: boolean;
  maxDecimals: number;
  groupSeparator: string;
  decimalSeparator: string;
};
export function maskOptionsForCurrency(
  currencyCode: string,
  opts: { allowDecimals: boolean; maxDecimals: number },
): NumericMaskOptions;
export function sanitizeRawInput(typedText: string, opts: NumericMaskOptions): string;
export function formatForDisplay(rawValue: string, opts: NumericMaskOptions): string;

// components/ui/money-input.tsx
export type MoneyInputProps = {
  id?: string;
  name?: string;
  value: string;                      // RAW string ("" when empty, "." decimal)
  onChange: (value: string) => void;  // receives RAW string
  onBlur?: () => void;
  currencyCode?: string;              // default "COP"
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
};
export type QuantityInputProps = Omit<MoneyInputProps, "currencyCode">;
export function MoneyInput(props: MoneyInputProps): React.ReactElement;
export function QuantityInput(props: QuantityInputProps): React.ReactElement;
```

## Scope

### In Scope (this PR)

- `lib/format/numeric-mask.ts` + `lib/format/numeric-mask.test.ts`
- `components/ui/money-input.tsx` (`MoneyInput`, `QuantityInput`) +
  `components/ui/money-input.test.tsx`
- `components/ui/input.tsx` ref-forwarding change (backward-compatible)
- This proposal

### Out of Scope (PR2+)

- Migrating any of the 7-8 existing money/quantity fields (payment amount,
  invoice line unit price/quantity, expense amount, etc.) to `MoneyInput`/
  `QuantityInput`.
- Any multi-currency UI — only the COP-fallback lookup seam is built.

## Multi-tenant / business_id Impact

None. This is a pure UI/formatting utility with no data access, no
`business_id` scoping, and no server interaction.

## Rollback Plan

Revert the 3 new files, the 2 new test files, and the `input.tsx` ref
change. No consumer imports these yet, so rollback is zero-risk.

## Success Criteria

- [x] `formatForDisplay`/`sanitizeRawInput` round-trip COP grouping/decimal
      rules exactly per the documented contract, unit-tested.
- [x] `MoneyInput`/`QuantityInput` let the field go empty (`value === ""`)
      with no forced `0`.
- [x] `MoneyInput`/`QuantityInput` set the correct `inputMode` for mobile.
- [x] `components/ui/input.tsx` forwards `ref` without breaking existing
      callers.
- [x] `lint`, `typecheck`, and the targeted test files pass; full suite has
      no regressions.
