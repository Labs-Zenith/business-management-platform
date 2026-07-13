# Archive Report: dashboard-excel-export

**Change**: dashboard-excel-export
**Archived**: 2026-07-13
**Status**: COMPLETE (PASS WITH WARNINGS — 0 CRITICAL, 1 non-blocking WARNING, 1 SUGGESTION)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Fase 2, point 3 — a full dashboard export (both Ingresos and Egresos tabs)
as Excel or PDF — has been fully planned, implemented, verified, and archived.
The change adds `GET /api/dashboard/export?format=xlsx|pdf`, an 8-sheet Excel
workbook renderer, a single-flowing multi-section PDF renderer, and an
Excel/PDF button pair in the dashboard header. It shipped as 4 chained PRs
(`315999b` → `b5a72a6` → `7f4a94f` → `6fbcef4`, all committed to main).
Verification passed: full test/typecheck/lint/build gate green (792 passed /
2 skipped, `/api/dashboard/export` registered as a dynamic route). No new
business logic, schema, or permission was introduced — it is a pure
read-and-format aggregation of the existing dashboard services.

---

## Pre-Archive Gates (all passed)

- **Task Completion Gate**: 10/10 tasks marked `[x]` across 4 phases in the
  persisted tasks artifact (Engram #106). No stale unchecked implementation
  tasks. No archive-time checkbox reconciliation was needed.
- **CRITICAL Gate**: verify-report (Engram #108) reports CRITICAL: 0. Archive
  is permitted.
- **Destructive-delta check** (config `rules.archive: Warn before merging
  destructive deltas`): the delta contains a single **ADDED** requirement — no
  MODIFIED / REMOVED / RENAMED requirements. The merge is purely additive and
  non-destructive; no warning/confirmation was required.

## Non-Blocking Findings (carried, not blocking archive)

- **WARNING (process-only)**: `openspec/config.yaml` sets
  `testing.strict_tdd: true`, but this change was implemented in Standard mode
  (code + co-located tests written together, verified via typecheck + scoped
  vitest, not RED-first). Behavioral compliance is fully satisfied by passing
  runtime tests, so it does not block archive; it is a process note for the
  user/orchestrator to acknowledge.
- **SUGGESTION (accepted design tradeoff, not a gap)**: the "Facturas
  vencidas" Excel sheet and PDF section intentionally omit a Cliente column,
  because `overdueInvoiceList` carries only `customerId` and the design fixes
  the assembly at 3 composite calls (no `collectAllCustomers` join). Documented
  in design.md and confirmed in code. Revisit only if stakeholders require
  customer names.

---

## What Shipped

| PR | Commit | Content | Review Lens |
|----|--------|---------|-------------|
| PR1 | `315999b` | `DashboardExportData` type + `renderDashboardWorkbook` (8 sheets) + tests | review-readability |
| PR2 | `b5a72a6` | `writeSectionHeading` + `renderDashboardExportPdf` (8 sections) + tests | review-readability |
| PR3 | `7f4a94f` | `app/api/dashboard/export/route.ts` wiring both renderers + route test | review-reliability + review-risk |
| PR4 | `6fbcef4` | dashboard header Excel/PDF button pair + test | review-readability |

Final section order (shared by Excel sheets and PDF sections): Resumen, Saldo
por estado, Mayores saldos, Pagos por mes, Facturas vencidas, Pagos recientes,
Gastos por categoria, Gastos recientes.

---

## Specs Synced to Main

**1 domain updated: `dashboard`.**

| Domain | Action | Details |
|--------|--------|---------|
| dashboard | Updated | +1 ADDED requirement (`Dashboard Full Export (Excel + PDF)`, 4 scenarios). 0 modified, 0 removed. |

The new requirement was appended to `openspec/specs/dashboard/spec.md` after
the existing `Egresos Empty State` requirement. All prior dashboard
requirements were preserved verbatim. This is now the source of truth for the
dashboard export behavior.

---

## Verification Verdict

**Status**: PASS WITH WARNINGS (0 CRITICAL, 1 WARNING, 1 SUGGESTION) — Engram #108

| Command | Result | Details |
|---------|--------|---------|
| `npm run test` (vitest run) | PASS | 792 passed, 2 skipped; 108 files passed / 1 skipped; 24.2s |
| `npm run typecheck` (`tsc --noEmit`) | PASS | exit 0, no errors |
| `npm run lint` (eslint) | PASS | clean, no output |
| `npm run build` (next build) | PASS | Compiled in 5.8s; `/api/dashboard/export` registered as dynamic (ƒ) route |

All 5 spec scenarios have passing covering tests (8-sheet Excel, flowing PDF,
400 on invalid/missing format, empty-state both formats, all 8 sections both
tabs).

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Topic Key |
|----------|----|-----------|
| Proposal | 103 | `sdd/dashboard-excel-export/proposal` |
| Spec (delta) | 104 | `sdd/dashboard-excel-export/spec` |
| Design | 105 | `sdd/dashboard-excel-export/design` |
| Tasks | 106 | `sdd/dashboard-excel-export/tasks` |
| Verify Report | 108 | `sdd/dashboard-excel-export/verify-report` |
| Archive Report | (this) | `sdd/dashboard-excel-export/archive-report` |

---

## Archive Actions Taken (this pass)

- Merged the delta's single ADDED requirement into
  `openspec/specs/dashboard/spec.md` (source of truth updated; all prior
  requirements preserved).
- Wrote this `archive-report.md` into the change folder so it travels with the
  folder move.
- Persisted this archive report to Engram (`sdd/dashboard-excel-export/archive-report`).
- Did **NOT** move or delete the original
  `openspec/changes/dashboard-excel-export/` folder, and did **NOT** run any
  `git`/commit operations — this executor has Write access but **no Bash
  access**, so it cannot perform the filesystem folder move/delete or git
  operations. The user must perform the single `git mv` below.

---

## Remaining Manual Step (user action — executor lacks Bash)

Run one command to move the change folder into the archive (preserves git
history; the `archive-report.md` and `specs/dashboard/spec.md` delta travel
with it):

```bash
git mv openspec/changes/dashboard-excel-export \
       openspec/changes/archive/2026-07-13-dashboard-excel-export
```

Then stage and commit the archive move together with the merged main spec:

```bash
git add openspec/specs/dashboard/spec.md \
        openspec/changes/archive/2026-07-13-dashboard-excel-export
git commit -m "chore(sdd): archive dashboard-excel-export change"
```

(No commit was made automatically, per this project's "never commit unless
explicitly asked" convention. Prefix with `ORCA_ATTRIBUTION_BYPASS=1` per the
project's git-attribution convention if committing from the tracked terminal.)

---

## SDD Cycle Complete

- **Proposal** (intent, scope, approach): Engram #103
- **Spec** (delta, ADDED export requirement): Engram #104 → merged to `openspec/specs/dashboard/spec.md`
- **Design** (3-call assembly, dual renderers, type home): Engram #105
- **Tasks** (4 chained PRs, 10 tasks): Engram #106 — all complete
- **Apply** (implementation): commits `315999b`, `b5a72a6`, `7f4a94f`, `6fbcef4`
- **Verify** (test execution, compliance): Engram #108 (PASS WITH WARNINGS, 0 CRITICAL)
- **Archive** (spec merged, this report): `2026-07-13-dashboard-excel-export`

---

**Archive Date**: 2026-07-13
**Archived By**: sdd-archive executor
**Final Status**: SPEC MERGED + REPORT PERSISTED — pending only the user's
single `git mv` (executor has no Bash access to move/delete the folder).
