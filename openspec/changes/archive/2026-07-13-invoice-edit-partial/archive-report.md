# Archive Report: invoice-edit-partial

**Archived**: 2026-07-13
**Status**: Intentional archive with warnings (see Gaps below)

## Summary

Relaxed the invoice edit-lock guard from "zero payments only" to "not fully
paid, and new total not below paid" across the service and repository
layers (mock + Postgres), fixed `status` recomputation on edit to use the
invoice's real `paid_amount` instead of a hardcoded `0`, and reformatted the
`invoice_updated` / `payment_recorded` audit-log `detail` strings to
human-readable COP via `formatCOP`. Both PR1 (backend) and PR2 (UI) are
reported committed by the user; full test suite green, including the
Docker-gated concurrency integration test.

## Task Completion Gate

`openspec/changes/invoice-edit-partial/tasks.md` reviewed in full: all
implementation tasks across Phase 1-6 plus the Review-Fix Addendum
(R.1-R.4) are checked `[x]`. No stale unchecked tasks found. Gate passes.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| invoices | Updated | 2 MODIFIED requirements replaced in `openspec/specs/invoices/spec.md`: "Invoice Editing Locked to Zero-Payment Invoices" → renamed and rewritten as "Invoice Editing Locked to Fully-Paid Invoices" (editable while `balance > 0`; locked when fully paid; rejected if new total < paid_amount, with layer-specific error codes: service `VALIDATION_ERROR`/`CONFLICT`, repository generic `CONFLICT`); "Edit-Lock Enforced in Both Service and Repository Layers" updated to describe the two-condition compound guard and the repository's inability to distinguish which condition failed. All 6 other pre-existing requirements in the main spec preserved verbatim. No leftover "zero-payment" references remain in the merged spec. |

Source of truth updated: `openspec/specs/invoices/spec.md`.

## Archive Contents

- proposal.md — present
- specs/invoices/spec.md (delta) — present, merged into main spec
- design.md — **MISSING** (not found in change folder; sdd-design output was
  apparently never persisted as a file for this change)
- tasks.md — present, all tasks `[x]`
- verify-report.md — **MISSING** (not found in change folder; sdd-verify
  output was apparently never persisted as a file for this change)
- archive-report.md — this file

## Gaps / Intentional Partial Archive

- No `design.md` or `verify-report.md` artifact exists on disk for this
  change. Per gentle-ai's stricter-than-OpenSpec archive policy, missing
  design/verify artifacts should normally block or require explicit user
  override.
- This archive proceeds as an **intentional partial archive** on the
  strength of the user's direct, explicit statement at archive time: both
  PR1 (backend) and PR2 (UI) are committed, the full test suite is green,
  and the concurrency integration test was Docker-verified. This statement
  is treated as the user-confirmed override for the missing artifacts.
- Risk: there is no persisted design rationale or formal verify-report to
  audit later if a regression surfaces in this area. Recommend that future
  changes always persist `sdd-verify` output to `verify-report.md` even
  when verification is run ad hoc.

## Filesystem Move

**NOT PERFORMED BY THIS AGENT** — the executing agent had no Bash/git tool
access in this session and cannot move, rename, or delete directories. The
user must run:

```
git mv openspec/changes/invoice-edit-partial openspec/changes/archive/2026-07-13-invoice-edit-partial
```

This report was written directly into the still-active
`openspec/changes/invoice-edit-partial/` folder so it travels with the
`git mv` above.

## Traceability (Engram)

No Engram observations were found for `sdd/invoice-edit-partial/{proposal,spec,design,tasks,verify-report}` — this change's artifacts live on the filesystem (openspec mode), not in Engram. This archive-report is persisted to Engram per explicit instruction, topic_key `sdd/invoice-edit-partial/archive-report`.

## SDD Cycle Status

Spec merge: complete. Folder move: pending user action (see above). Once
the `git mv` is run, the SDD cycle for `invoice-edit-partial` is closed.
