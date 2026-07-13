# Proposal: DatePicker Rollout

## Intent

Replace plain `<input type="date">` across all forms with a shadcn Calendar-based
date picker (Phase 6b, plan point 8). Native date inputs render inconsistently
per browser/OS and clash with the app's design system. Goal: one reusable,
locale-formatted picker, defaulting to today, with the `YYYY-MM-DD` string
contract and `todayIsoDate()` defaults unchanged so no schema/payload changes.

## Scope

### In Scope
- New `components/ui/date-picker.tsx` (Popover + Calendar + Button trigger),
  controlled `value: string` (ISO `YYYY-MM-DD`) / `onChange: (v: string) => void`,
  defaulting to `todayIsoDate()`. No Date-object API leaks to consumers.
- Migrate 10 call sites / 6 files across 3 patterns: RHF (`invoice-form-content`,
  `expense-form-dialog-content`, `payroll-payment-form-dialog-content`) via
  `Controller`; plain-useState (`payment-form-dialog-content`) via direct wiring;
  native-GET filter bars (`invoices/page`, `payments/page`) via a client island
  + hidden `<input>`.
- Rewrite affected form tests to `userEvent`-driven Calendar interaction.

### Out of Scope
- `components/domain/inventario/movement-form-dialog-content.tsx` (no date field — confirmed).
- DIAN-notice removal (split into separate `dian-notice-removal` change).
- Zod schemas, API payloads, `lib/dates.ts` (value contract unchanged).

## Capabilities

### New Capabilities
- None. UI-mechanism refactor; no new user-facing capability.

### Modified Capabilities
- None. Date value format (`YYYY-MM-DD`), defaults, and submitted payloads are
  preserved identically — no spec-level requirement changes.

## Approach

Mirror `components/ui/select.tsx` wrapper convention. `DatePicker` composes
existing `Popover`/`Calendar` (react-day-picker, `mode="single"`), converting
`value` string ↔ `Date` only at the boundary; display via `date-fns/format`
with `es` locale (`"d MMM yyyy"`). Preserve payroll `useWatch` period-preview —
`Controller.field.onChange` updates reactive state exactly as `register()` did.
Native filter bars keep the `<form>` GET (no-JS submit intact) with a hidden
input synced by the island.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `components/ui/date-picker.tsx` | New | Reusable picker |
| `components/domain/**` (4 forms) | Modified | Swap inputs, add `Controller`/island |
| `app/(dashboard)/{invoices,payments}/page.tsx` | Modified | Client island + hidden input |
| Form test files (4+) | Modified | `userEvent` Calendar interaction |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Payroll preview stops reacting | Med | `Controller.onChange`; assert live preview in test |
| Filter bar loses no-JS GET submit | Med | Keep hidden native input inside `<form>` |
| Test rewrite churn | High | Standardize `userEvent` click-day helper |
| Locale/format mismatch | Low | Single `date-fns` `es` format constant |

Multi-tenant/RLS: no impact — pure client UI, no data-access or `business_id` touch.

## Rollback Plan

Per-slice revert. Component is additive (PR1); each migration PR is independent —
revert re-exposes native inputs with unchanged value contract, no data migration.

## Dependencies

- `react-day-picker` ^10, `date-fns` ^4, `@testing-library/user-event` — all present.

## Success Criteria

- [x] All 10 sites use `DatePicker`; no `type="date"` remains (except non-goals).
- [x] Submitted `YYYY-MM-DD` values identical to pre-change.
- [x] Payroll period preview updates live on date select.
- [x] Filter bars still submit via GET with JS disabled.
- [x] `npm run test` + `npm run build` green.

## Proposal question round — resolved

1. Display format: `"d MMM yyyy"` with `date-fns` `es` locale (e.g. "7 jul 2026") — proceeding as recommended; more readable/disambiguated than numeric `dd/MM/yyyy`.
2. PR split confirmed as recommended: PR1 = `DatePicker` component (isolated, fully tested); PR2 = RHF migrations; PR3 = plain-useState + native-GET islands.
3. Optional-date fields (`dueDate`) keep an empty/"—" placeholder + clearable picker, no forced default — confirmed.
