# Archive Report: datepicker-rollout

**Change**: datepicker-rollout
**Archived**: 2026-07-13
**Status**: COMPLETE (PASS, no CRITICAL or WARNING issues)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Phase 6b, plan point 8 — replacing native `<input type="date">` with a
reusable, shadcn-Calendar-based `DatePicker` — has been fully implemented,
verified, and archived. All 10 date-input call sites across 6 files now use
the new component, shipped as 4 chained PRs (`6ef051e` → `7db5026` → `837750c`
→ `1627828`, all committed to main, working tree clean). This was a pure
UI-mechanism refactor: no spec-level capability changed (proposal explicitly
scoped "Capabilities: None"), so there is no spec-merge step for this archive
— only proposal.md/design.md/tasks.md are archived alongside the verify
report. Verification passed cleanly: full typecheck/lint/test/build gate
green, including two independently-seeded shuffled test runs proving order
independence, with zero unexpected native `type="date"` remaining in the
repo. Six real, non-trivial bugs were caught and fixed during development
(detailed below) — this is not a report of claimed features but of verified,
source-confirmed behavior.

---

## What Shipped

### PR1 — `6ef051e`: reusable `DatePicker` component
`components/ui/date-picker.tsx`: Popover + Calendar + Button trigger
mirroring `select.tsx`'s wrapper convention. Public API is a plain ISO
`YYYY-MM-DD` string (`value`/`onChange`) — no `Date` object ever crosses the
component boundary, so none of the 6 consumer files needed schema or payload
changes. `date-fns`'s `parseISO`/`format` handle the boundary conversion;
write-back uses `format(date, "yyyy-MM-dd")` (local calendar day), never
`.toISOString().slice(0,10)`.

### PR2 — `7db5026`: invoice + expense RHF migration
`invoice-form-content.tsx` (`issueDate`, `dueDate`) and
`expense-form-dialog-content.tsx` (`expenseDate`) migrated from
`register()`-bound native inputs to `Controller`-wrapped `DatePicker`.
`dueDate` stays clearable (empty/"—" placeholder, no forced default) per the
proposal's optional-date decision. A post-review fix pass in this PR added
tests proving (a) clearing a REQUIRED date field blocks submission with a
validation error, and (b) picking-then-clearing `dueDate` correctly omits it
from the payload — both previously untested gaps. Shared `pickDay`/
`displayDate`/`clearDay` test helpers were extracted into
`components/ui/date-picker-test-helpers.ts` ahead of PR3/PR4 needing them.

### PR3 — `837750c`: payroll RHF migration, isolated (highest reactivity risk)
`payroll-payment-form-dialog-content.tsx`'s `referenceDate`/`paymentDate`
migrated to `Controller`-wrapped `DatePicker`, given its own PR per design.md
because of the live period-preview's reactivity risk. The
`useWatch({control, name:"referenceDate"})` → `computePeriod`/`periodDays`
preview block was left byte-for-byte unchanged — confirmed via
`git show 837750c` diff inspection at verify time (only the input swap
appears in the diff). A new, explicit test proves the live preview text
actually updates when a date is picked via the Calendar UI, not merely that
the underlying field value changes — the single most load-bearing test in
this change, given `Controller.field.onChange` had to reproduce exactly what
`register()` previously did for `useWatch` subscribers.

### PR4 — `1627828`: payment dialog + progressive-enhancement filter bars
`payment-form-dialog-content.tsx`'s plain-`useState` `paymentDate` wired
directly to `DatePicker` (no `Controller`, since there's no RHF involved).
`components/domain/filters/date-filter-field.tsx` (new): a progressive-
enhancement client island for `invoices/page.tsx` and `payments/page.tsx`'s
`from`/`to` GET filters — native `<input type="date">` pre-mount (so no-JS
GET submit keeps working), swapping to a hidden `<input type="hidden">` +
`DatePicker` post-mount, with only one input ever carrying the `name`
attribute. A post-review fix pass in this PR closed 5 gaps (see "Real Bugs
Caught and Fixed" below).

---

## Real Bugs Caught and Fixed During Development

These are not claimed features — each is verified present in the shipped
source at archive time (file/line references below reflect the code read
during this archive pass).

1. **Locale-import collision (`date-fns` vs `react-day-picker`'s `es` exports)**.
   A single `es` import for both `date-fns`'s `format()` and `Calendar`'s
   `locale` prop is wrong: `date-fns/locale`'s `es` lacks the `.labels`
   react-day-picker needs (`labelDayButton`/`labelNext`/`labelPrevious`), so
   the Calendar's day-cell/nav aria-labels would silently fall back to
   English. Fixed with two separate imports —
   `import { es } from "date-fns/locale"` for display text and
   `import { es as rdpEs } from "react-day-picker/locale"` for the Calendar's
   `locale` prop. Confirmed shipped: `components/ui/date-picker.tsx` lines
   5-16, with inline documentation of why they must stay separate.

2. **UTC off-by-one guard**. Write-back on date select MUST use
   `format(date, "yyyy-MM-dd")` (local calendar day), never
   `date.toISOString().slice(0,10)`, which would reintroduce the exact
   UTC-vs-local timezone bug `lib/dates.ts` already documents. Confirmed via
   `date-picker.tsx` line 91 and a dedicated regression test in
   `date-picker.test.tsx` ("writes back the exact local calendar day picked,
   with NO UTC off-by-one, even in a timezone ahead of UTC") that sets
   `process.env.TZ = "Asia/Tokyo"` (UTC+9, where local midnight is the
   previous UTC day) and asserts the naive `.toISOString()` conversion
   *would* have produced a different, wrong date — proving the test actually
   exercises the bug class, not just a happy path.

3. **Invalid-date-string crash guard**. A malformed `value` prop (e.g.
   corrupt/truncated upstream data) makes `parseISO` return an `Invalid Date`,
   which is truthy — left unguarded, `format()` throws "Invalid time value"
   and crashes the render tree. Fixed with an explicit `isValid(parsed)`
   check in `date-picker.tsx` (line 57) that falls back to the "no value"
   (placeholder) state instead. Confirmed shipped with a covering test:
   "shows the placeholder instead of crashing when value is a malformed date
   string" in `date-picker.test.tsx`.

4. **Broken TZ-restore in a test's `afterEach`**. The naive pattern
   `process.env.TZ = ORIGINAL_TZ` is broken when `ORIGINAL_TZ` was originally
   `undefined`: assigning `undefined` to `process.env.TZ` does NOT unset it —
   Node stringifies it to the literal string `"undefined"`, an invalid IANA
   zone name that silently falls back to UTC, leaving later tests in the same
   worker process running under a forced, non-obvious timezone. Fixed by
   explicitly `delete process.env.TZ` when the original value was unset,
   only reassigning when there was a real prior value. Confirmed shipped in
   `date-picker.test.tsx`'s `afterEach` (lines 12-24), with an inline comment
   explaining the failure mode.

5. **Stray `value=""` SSR attribute**. `date-filter-field.tsx`'s native-input
   fallback originally used `defaultValue={defaultValue ?? ""}`. Confirmed
   (empirically, via a scratch `renderToStaticMarkup` script — not assumed)
   that React's SSR markup emits a literal `value=""` attribute whenever
   `defaultValue` is an empty string, but omits the attribute entirely when
   `defaultValue` is `undefined`. On a fresh page load (no `from`/`to` query
   param yet), the `?? ""` fallback produced the noisier, non-idiomatic
   markup. Fixed by passing `defaultValue={defaultValue}` through as-is.
   Functionally harmless either way, but confirmed shipped in
   `date-filter-field.tsx` (lines 91-98) with the reasoning documented inline.

6. **Missing page-level wiring tests**. The pre-existing
   `app/(dashboard)/payments/page.test.tsx` only proved `from`/`to` search
   params reached the `listPayments` service call — nothing actually
   rendered the page and asserted the filter-bar JSX contained a correctly
   wired `DateFilterField`. Fixed by adding a real wiring test to
   `payments/page.test.tsx` (asserting the hidden inputs carry the exact ISO
   values post-mount) and by creating `app/(dashboard)/invoices/page.test.tsx`
   from scratch — no test file existed for that page before this change at
   all. Both confirmed present as glob-matched files at archive time.

---

## Verification Verdict

**Status**: PASS (no CRITICAL or WARNING issues)

### Test Results
| Command | Result | Details |
|---------|--------|---------|
| `npm run typecheck` (`tsc --noEmit`) | PASS | Clean, zero errors |
| `npm run lint` (eslint) | PASS | Clean, zero warnings/errors |
| `npx vitest run` (default order) | PASS | 105 passed / 1 skipped test files, 778 passed / 2 skipped tests |
| `npx vitest run --sequence.shuffle --sequence.seed=42` | PASS | Identical 778/2 — order-independence confirmed |
| `npx vitest run --sequence.shuffle --sequence.seed=7` | PASS | Identical 778/2 — order-independence confirmed (2nd seed) |
| `npm run build` (Next.js 16.2.10, Turbopack) | PASS | All 29 routes generated, zero errors |

### Completeness
- Tasks: 5 phases (PR1-PR4 + aggregate gate), all leaf items `[x]` on the
  persisted `tasks.md`, cross-checked against git log and current file
  contents by `sdd-verify` — accurate.
- Repo-wide native `type="date"` grep (`app/`+`components/`, excluding
  `*.test.*`): exactly 2 hits, both expected/documented exceptions
  (`date-filter-field.tsx`'s intentional no-JS SSR fallback, and a stale
  cosmetic JSDoc comment in `payroll-payment-form-schema.ts`). Zero
  unexpected native date inputs remain.
- Success criteria (all 5 from proposal.md) confirmed met: all 10 sites use
  `DatePicker`; submitted `YYYY-MM-DD` values identical pre/post-change;
  payroll preview updates live; filter bars submit via GET with JS disabled;
  `npm run test` + `npm run build` green.

No non-blocking warnings were raised in the verify report; the single
suggestion (stale "uncommitted" language in the apply-progress Engram
artifact, a memory-staleness cosmetic issue, not a code gap) does not affect
this archive's completeness.

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Topic Key |
|----------|----|-----------|
| Proposal | 90 | `sdd/datepicker-rollout/proposal` |
| Design | 93 | `sdd/datepicker-rollout/design` |
| Tasks | 94 | `sdd/datepicker-rollout/tasks` |
| Apply Progress | 97 | `sdd/datepicker-rollout/apply-progress` |
| Verify Report | 99 | `sdd/datepicker-rollout/verify-report` |

No spec observation exists for this change (no `spec.md` was produced — the
proposal explicitly scoped "Capabilities: None", a pure UI-mechanism refactor
with no new/modified spec-level requirements). This archive report is saved
as `sdd/datepicker-rollout/archive-report` (topic_key-based upsert).

---

## Specs Synced to Main

**None.** This change has no delta spec — confirmed by the proposal's
explicit "Capabilities: None" section and independently confirmed by
`sdd-verify` (Engram #99: "No spec.md — confirmed pure UI-mechanism refactor,
no new/modified capabilities"). No `openspec/specs/` files were touched or
need to be touched by this archive.

---

## Archive Actions Taken (this pass)

- Wrote `proposal.md`, `design.md`, `tasks.md`, `verify-report.md`, and this
  `archive-report.md` into
  `openspec/changes/archive/2026-07-13-datepicker-rollout/`.
- `proposal.md`'s Success Criteria checkboxes were updated from `[ ]` to
  `[x]` to reflect confirmed completion (all 5 criteria verified met per the
  verify report).
- `design.md`'s two `Open Questions` checkboxes were left as `[ ]` to
  preserve the original artifact verbatim; their resolved status is recorded
  in a clearly-marked "Addendum (added at archive time)" section appended to
  the end of that file instead of edited in place.
- `tasks.md` is a faithful copy of the source (all Phase 1-5 items already
  `[x]`), with a similarly clearly-marked archive-time note appended
  describing the PR4 post-review fix pass that happened after task 4.7 was
  checked off.
- Did **NOT** move or delete the original
  `openspec/changes/datepicker-rollout/` working folder, and did **NOT** run
  any `git add`/commit — this executor lacks Bash/Write access to perform
  filesystem moves/deletes or git operations outside the Write tool. The
  orchestrator/user must delete the original folder and commit.

---

## SDD Cycle Complete

- **Proposal** (intent, scope, approach): Engram #90, archived copy in this folder
- **Design** (technical approach, integration patterns, testing strategy): Engram #93, archived copy in this folder
- **Tasks** (work units, phases, verification gate): Engram #94, archived copy in this folder, all leaf items complete
- **Apply** (implementation): commits `6ef051e`, `7db5026`, `837750c`, `1627828`; Engram #97
- **Verify** (test execution, compliance): Engram #99 (PASS, no CRITICAL/WARNING)
- **Archive** (artifacts archived, this report): `2026-07-13-datepicker-rollout`

---

## Next Steps

1. **Immediate (orchestrator/user action required)**: delete the original
   `openspec/changes/datepicker-rollout/` working folder (its contents have
   already been copied into this archive folder) and `git add`/commit both
   the new archive folder and the deletion. No commit was made automatically
   by this archive pass, per this project's "never commit unless explicitly
   asked" convention.
2. **None functionally outstanding**: the verify report found no CRITICAL or
   WARNING issues; there is no recommended follow-up change required by this
   archive.

---

**Archive Date**: 2026-07-13
**Archived By**: sdd-archive executor
**Final Status**: READY FOR NEXT CHANGE — pending only the orchestrator/user
deleting the original working folder and committing (archive files already
written, no spec merge required since this change produced no spec delta).
