# Tasks: DatePicker Rollout

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180 + ~200 + ~180 + ~260 = ~820 total, 4 slices each under budget |
| 400-line budget risk | Low (per slice) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 (feature-branch-chain) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `DatePicker` component + unit test | PR 1 | Base = feature/tracker branch. Isolated, fully tested, no consumers yet. ~180 lines. |
| 2 | Invoice + expense RHF migration | PR 2 | Base = PR 1 branch. `Controller` swap, "simple" RHF cases. ~200 lines. |
| 3 | Payroll RHF migration (isolated) | PR 3 | Base = PR 2 branch. Highest-risk reactivity wiring, own PR per design.md. ~180 lines. |
| 4 | Payment useState + native-GET filter islands | PR 4 | Base = PR 3 branch. If forecast exceeds 400, split 4a (payment dialog) from 4b (filter islands). ~260 lines. |

## Phase 1: `DatePicker` Component (PR1)

- [x] 1.1 Create `components/ui/date-picker.tsx`: `DatePickerProps` (`value: string | undefined`, `onChange: (value: string) => void`, `placeholder?`, `disabled?`, `id?`), Popover+Calendar+Button per design.md component API, `parseISO`/`format` at the boundary, `DISPLAY_FORMAT = "d MMM yyyy"` with `date-fns/locale/es`.
- [x] 1.2 Write-back on select MUST use `format(date, "yyyy-MM-dd")`; NEVER `date.toISOString().slice(0,10)`.
- [x] 1.3 Create `components/ui/date-picker.test.tsx`: renders placeholder when `value` is empty; opens popover via trigger click; clicking a day fires `onChange` with correct ISO string; re-clicking the selected day fires `onChange("")` (clearable); a local-timezone-sensitive test (`vi.setSystemTime`, non-UTC-safe date near midnight) proving no UTC off-by-one on the ISO write-back; display formatting assertion (`"d MMM yyyy"`, `es` locale).
- [x] 1.4 Verify: `npm run test -- date-picker`, `npx tsc --noEmit`, `npm run build`.

## Phase 2: Invoice + Expense RHF Migration (PR2)

- [x] 2.1 In `components/domain/invoices/invoice-form-content.tsx`, replace `<Input type="date" {...register("issueDate")}>` and `dueDate` with `Controller`-wrapped `DatePicker` (`field.value`/`field.onChange`), preserving `<Label htmlFor>` id association.
- [x] 2.2 Keep `dueDate` clearable (empty/"—" placeholder, no forced default) per design.md optional-date decision.
- [x] 2.3 In `components/domain/dashboard/expense-form-dialog-content.tsx`, replace `expenseDate`'s native input with `Controller`-wrapped `DatePicker`.
- [x] 2.4 Update `components/domain/invoices/invoice-form-content.test.tsx`: replace `fireEvent.change` on the date inputs with the `pickDay` helper (`getByLabelText` trigger click → `getByRole("button", {name: PPPP-es-label})` day click); pin system time via `vi.setSystemTime`.
- [x] 2.5 Update `components/domain/dashboard/expense-form-dialog-content.test.tsx` with the same `pickDay` interaction pattern for `expenseDate`.
- [x] 2.6 Verify: `npm run test -- invoice-form-content expense-form-dialog-content`, `npx tsc --noEmit`, `npm run build`.

### PR2 post-review fix pass (test coverage gaps found by 2-lens review)

- [x] 2.7 Added a test in each of `invoice-form-content.test.tsx` (`issueDate`) and `expense-form-dialog-content.test.tsx` (`expenseDate`) proving that clearing a REQUIRED date field via `DatePicker`'s re-click-to-clear gesture blocks client-side submission (validation error shown, no request sent) — previously untested.
- [x] 2.8 Added a NEW `invoice-form-content.test.tsx` test that picks a `dueDate` then clears it via the same gesture and asserts it's omitted from the payload, proving the clear gesture itself round-trips through the `Controller` wiring (the pre-existing "omits dueDate ... unset" test only ever left the field untouched, which happened to look the same but didn't exercise the clear interaction).
- [x] 2.9 Extracted the duplicated `pickDay`/`displayDate` test helpers (plus a new `clearDay` helper) from both test files into `components/ui/date-picker-test-helpers.ts`, ahead of PR3/PR4 needing the same helpers a 3rd/4th time.

## Phase 3: Payroll RHF Migration — Isolated, Highest Risk (PR3)

- [x] 3.1 In `components/domain/nomina/payroll-payment-form-dialog-content.tsx`, replace `referenceDate` and `paymentDate` native inputs with `Controller`-wrapped `DatePicker`, using `field.onChange(newIso)` exactly as design.md specifies.
- [x] 3.2 Leave the existing `useWatch({control, name: "referenceDate"})` → `computePeriod`/`periodDays` preview block, and the `periodType` `register()`/`useWatch` code, byte-for-byte unchanged.
- [x] 3.3 Update `components/domain/nomina/payroll-payment-form-dialog-content.test.tsx`: replace date-setting steps with `pickDay`; keep existing `computePeriod`/`periodDays` assertions.
- [x] 3.4 Add an EXPLICIT new test proving the live period-preview updates when a date is picked via the Calendar UI (not just that field value changes): pick a `referenceDate` day via `pickDay`, then assert the rendered preview text/period days reflects the new date — this is the single most important test in this change.
- [x] 3.5 Verify: `npm run test -- payroll-payment-form-dialog-content`, `npx tsc --noEmit`, `npm run build`.

## Phase 4: Payment Dialog + Native-GET Filter Islands (PR4)

- [ ] 4.1 In `components/domain/payments/payment-form-dialog-content.tsx`, replace the plain-`useState` `paymentDate` native input with direct `DatePicker` `value`/`onChange` wiring (`onChange={(v) => updateField("paymentDate", v)}`); no other state changes.
- [ ] 4.2 Update `components/domain/payments/payment-form-dialog-content.test.tsx` with `pickDay` interaction pattern.
- [ ] 4.3 Create `components/domain/filters/date-filter-field.tsx` (`"use client"`): progressive enhancement per design.md — pre-mount renders native `<input type="date" name id defaultValue>`; `useEffect` sets `mounted=true` post-mount, swapping to hidden `<input type="hidden" name value>` + `DatePicker(value, onChange=setValue)`; only one input ever carries `name`.
- [ ] 4.4 Wire `DateFilterField` into `app/(dashboard)/invoices/page.tsx`'s `from`/`to` filters inside the existing `<form method="get">`, replacing the two native `type="date"` inputs.
- [ ] 4.5 Wire `DateFilterField` into `app/(dashboard)/payments/page.tsx`'s `from`/`to` filters identically.
- [ ] 4.6 Create `components/domain/filters/date-filter-field.test.tsx`: (a) no-JS path — render without letting the mount effect resolve (or assert first synchronous render) and assert a native `<input type="date" name="...">` with correct `name`/`defaultValue` is present and submittable; (b) JS-enhanced path — after effects flush, assert the hidden `<input type="hidden" name value>` carries the picked value and the `DatePicker` Calendar UI is shown, with no duplicate `name` attributes across both inputs simultaneously.
- [ ] 4.7 Verify: `npm run test -- payment-form-dialog-content date-filter-field`, manual/test check that `invoices/page.tsx` and `payments/page.tsx` GET-filter tests (if any exist) still pass, `npx tsc --noEmit`, `npm run build`.

## Phase 5: Aggregate Verification Gate (per-PR + final)

- [ ] 5.1 Per-PR gate (PR1-PR4): `npx tsc --noEmit`, `npm run lint`, `npm run test` scoped to touched files, all green before opening/advancing the PR.
- [ ] 5.2 At least one full `npm run test -- --sequence.shuffle` run (order-independence check) before merging PR4 / the tracker branch.
- [ ] 5.3 Final aggregate gate after all 4 PRs land: `npm run test`, `npm run build`, confirm no `type="date"` remains outside `components/domain/inventario/movement-form-dialog-content.tsx` (out of scope) and no DIAN-notice files touched.
- [ ] 5.4 Confirm proposal Success Criteria: all 10 sites use `DatePicker`; submitted `YYYY-MM-DD` values identical pre/post-change; payroll preview updates live; filter bars submit via GET with JS disabled.
