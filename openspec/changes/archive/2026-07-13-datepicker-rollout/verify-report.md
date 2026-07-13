# Verification Report: datepicker-rollout

**Verdict: PASS**

### Artifact mode
Hybrid (openspec files + Engram). Read proposal.md, design.md, tasks.md (all 5 phases, all checkboxes [x]) plus Engram apply-progress (#97). No spec.md — confirmed pure UI-mechanism refactor, no new/modified capabilities, consistent with proposal's "Capabilities: None" section.

### Git state cross-check
`git log --oneline -10`: 1627828 (PR4: payment dialog + filter bars) is HEAD, then 837750c (PR3 payroll), 7db5026 (PR2 invoice/expense), 6ef051e (PR1 component). `git status --short` is clean — all 4 PRs fully committed to main, matching user's premise. NOTE: Engram apply-progress obs #97 still says PR3/PR4 "uncommitted" — that's stale (written mid-session before the final commits landed); current repo state supersedes it. Cosmetic-only, not a real gap.

### Command evidence (all run this session)
- `npm run typecheck` (tsc --noEmit): clean, zero errors.
- `npm run lint` (eslint): clean, zero warnings/errors.
- `npx vitest run` (default order): 105 passed | 1 skipped test files, 778 passed | 2 skipped tests.
- `npx vitest run --sequence.shuffle --sequence.seed=42`: identical 778 passed | 2 skipped.
- `npx vitest run --sequence.shuffle --sequence.seed=7`: identical 778 passed | 2 skipped. Order-independence confirmed across 2 distinct seeds.
- `npm run build` (Next.js 16.2.10, Turbopack): succeeded, all 29 routes generated, zero errors.

### Repo-wide native date-input grep (app/ + components/, excluding *.test.*)
Exactly 2 hits, both expected/documented exceptions — zero unexpected native `type="date"` remain:
1. `components/domain/filters/date-filter-field.tsx` line 90 — intentional no-JS SSR fallback (progressive enhancement island), by design.
2. `components/domain/nomina/payroll-payment-form-schema.ts` line 12 — stale JSDoc comment only ("the native `<input type=\"date\">` already constrains the shape"), confirmed non-executable, purely cosmetic doc lag pre-dating this session.

### Point-by-point requirement verification
1. **Tasks vs reality**: all Phase 1-5 checkboxes `[x]` in tasks.md; cross-checked against git log and current file contents — accurate.
2. **Test suite**: see command evidence above, all green including 2 shuffled seeded runs + build.
3. **Native date-input grep**: zero unexpected hits (see above).
4. **ISO conversion**: `components/ui/date-picker.tsx` line 91 uses `format(date, "yyyy-MM-dd")` on select; zero `.toISOString()` calls in executable code (only referenced in warning comments at lines 31/87). Confirmed correct.
5. **Two separate locale imports**: `date-picker.tsx` lines 15-16 — `import { es } from "date-fns/locale"` (format display) and `import { es as rdpEs } from "react-day-picker/locale"` (Calendar's `locale` prop, line 82: `locale={rdpEs}`). Correctly NOT collapsed; documented inline why.
6. **Payroll preview unchanged**: `git show 837750c -- payroll-payment-form-dialog-content.tsx` diff confirmed — only import lines + the two `<Input type=date>` → `<Controller><DatePicker/></Controller>` swaps changed. The `useWatch({control,name:"referenceDate"})`/`computePeriod`/`periodDays`/`preview` block is entirely absent from the diff, i.e., byte-for-byte untouched.
7. **date-filter-field mount detection**: uses `React.useSyncExternalStore(subscribeNoop, getClientMountedSnapshot, getServerMountedSnapshot)`, not `useState`+`useEffect` (rejected per inline comment — trips `eslint-plugin-react-hooks`'s `set-state-in-effect` rule). A genuine `hydrateRoot`-based test exists (`date-filter-field.test.tsx` lines 115-139) asserting `console.error` was never called during hydration — real proof of no hydration mismatch, not just a claim.
8. **Shared test helpers**: `components/ui/date-picker-test-helpers.ts` (`pickDay`/`displayDate`/`clearDay`) confirmed imported (not reimplemented) in all 5 required test files: invoice-form-content.test.tsx, expense-form-dialog-content.test.tsx, payroll-payment-form-dialog-content.test.tsx, payment-form-dialog-content.test.tsx, date-filter-field.test.tsx. Grepped for local `function pickDay/clearDay/displayDate` redefinitions in the 4 form test files — none found.

### Issues found
No CRITICAL or WARNING issues.

**SUGGESTION (1)**: Engram apply-progress artifact (obs #97) contains stale "uncommitted at 837750c" / "uncommitted" language for PR3/PR4 that no longer reflects reality (all 4 PRs are now committed to main, git status clean). Purely a memory-artifact staleness issue, not a code gap — safe to archive as-is, or refresh the artifact language if the user wants Engram history to read cleanly.

### Final Verdict
**PASS** — ready for `sdd-archive`. All tasks complete and verified against actual code/git state; full test/typecheck/lint/build suite green across default + 2 shuffled-seed runs; zero unexpected native date inputs remain; both historically-tricky bugs (UTC off-by-one, collapsed locale imports) verified NOT reintroduced; payroll reactivity and hydration-safety claims verified with runtime test evidence, not just static inspection.

---
Source: Engram observation #99, topic `sdd/datepicker-rollout/verify-report`.
Session: 19e91faa-7e9e-4fbf-aafe-ce04d5d8f355
