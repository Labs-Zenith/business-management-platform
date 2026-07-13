# Archive Report: dian-notice-removal

**Change**: dian-notice-removal
**Archived**: 2026-07-13
**Status**: COMPLETE (PASS WITH WARNINGS)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Fase 2 plan item 1 — "El mensaje de factura de Dian quitarlo" — has been fully implemented, verified, and archived. The DIAN non-fiscal legal notice ("Documento interno, no valido como factura electronica DIAN.") has been removed outright from both printable comprobantes (invoice and payment receipts) and the invoice PDF export, with no replacement notice introduced. This was a governed removal: spec, code, tests, and docs were all updated together in a single commit (da56b09), so nothing is left asserting a requirement that no longer exists. Verification passed with 2 non-blocking WARNINGs (a missing PDF-content regression test, and non-tabular TDD evidence reporting); no CRITICAL issues. Ready for the next SDD change.

---

## What Shipped

### Commit da56b0943baeaa46783266dcb60d87c7ac558f1b — "feat: remove DIAN legal notice from receipts and PDF export"

- Deleted `components/domain/receipts/dian-notice.tsx` and its 2 render call sites/imports (`app/(print)/invoices/[id]/receipt/page.tsx`, `app/(print)/payments/[id]/receipt/page.tsx`).
- Removed the duplicated `DIAN_NOTICE` const and its 2 usage lines in `lib/export/pdf.ts`'s `renderInvoicePdf`.
- Updated 3 test files to assert the notice's absence (not delete-and-leave-a-gap): both `page.test.tsx` files (invoice + payment, 3 assertion sites total) and `e2e/smoke.spec.ts`.
- Cleaned up a stray dangling `DianNotice` comment reference in `app/(print)/layout.tsx`'s JSDoc, found during the apply phase's final grep sanity pass (not originally listed in tasks.md).
- Deleted DIAN-notice-as-requirement language from `docs/security-plan.md` (removed the "Aviso legal de documentos" section + checklist item), `docs/mvp-scope.md` (only the "Aviso visible" bullet — the unrelated "Fuera de alcance" DIAN-integration bullets were correctly left untouched), `docs/ui-ux-flow.md`, and `docs/testing-plan.md`.
- Followed Strict TDD (`strict_tdd: true` in `openspec/config.yaml`): RED (updated the 2 page.test.tsx files to assert absence first, confirmed 3 failing against the still-present notice) → GREEN (removed production code, confirmed passing) before touching e2e/docs.
- No commit message co-authorship added, per project convention (`feedback_commit_conventions.md`).

---

## Verification Verdict

**Status**: PASS WITH WARNINGS

### Test Results
| Command | Result | Details |
|---------|--------|---------|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | eslint clean |
| `npx vitest run` | PASS | 749/751 passed, 2 pre-existing skipped, 102/103 test files |
| `npm run build` | PASS | `next build` Turbopack; only a pre-existing unrelated "middleware deprecated" warning |

### Completeness
- Tasks: 4 phases, 18 leaf items, all `[x]` on the persisted `tasks.md`, cross-checked against the actual commit diff.
- Spec compliance: 3/4 directly-testable scenarios have passing covering tests; the 4th (PDF-export text-content absence) is source-verified compliant but lacks a dedicated runtime regression test — flagged as WARNING, not a blocker (see verify-report.md for full reasoning).

### Non-Blocking Warnings (Not Blockers For This Archive)
1. **Missing PDF-content regression test** for the "No DIAN notice in invoice PDF export" scenario. `lib/export/pdf.ts` has no dedicated test file; `invoice-pdf-route.test.ts` never inspects PDF text content (only status/headers/magic-bytes/length). The removal itself is unambiguously confirmed via direct source reading (single hardcoded string constant, one definition + one usage site, both fully deleted, no other path to reintroduce it). **Recommended as a separate follow-up**: add a test that extracts text from a `renderInvoicePdf` sample (e.g. via `pdf-parse`) and asserts the DIAN string's absence.
2. **TDD evidence reported narratively, not in the structured per-task table format** expected by strict-tdd-verify.md. Substance is present (test-first RED→GREEN workflow was followed for the 2 page-test files) but per-task granularity for tasks 1.1-2.3 cannot be independently cross-verified from the artifact as written. No functional impact — informational for future apply-phase reporting hygiene.

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Topic Key |
|----------|----|-----------|
| Spec Delta | 91 | `sdd/dian-notice-removal/spec` |
| Tasks | 92 | `sdd/dian-notice-removal/tasks` |
| Apply Progress | 95 | `sdd/dian-notice-removal/apply-progress` |
| Verify Report | 96 | `sdd/dian-notice-removal/verify` |

This archive report is saved as `sdd/dian-notice-removal/archive-report` (topic_key-based upsert).

---

## Specs Synced to Main

### Modified Specs (Delta Merged)
- `openspec/specs/receipts/spec.md`:
  - **REMOVED** the "Mandatory Legal Notice" requirement (previously mandated the DIAN notice text on every printable comprobante).
  - **ADDED** the "No DIAN/Tax-Authority Notice" requirement, with 3 scenarios: no DIAN notice on printable invoice receipt, no DIAN notice on printable payment receipt, no DIAN notice in invoice PDF export.
  - **Editorial consistency fix** (not part of the literal delta, applied during merge for internal consistency): the `## Purpose` line previously read "...each carrying the mandatory non-fiscal legal notice, scoped to the authenticated business." — updated to "...scoped to the authenticated business." since the notice requirement it referenced no longer exists. Flagging this explicitly since it was not itself part of the ADDED/REMOVED delta blocks.
  - The two untouched requirements ("Printable Invoice Comprobante", "Printable Payment Receipt", "business_id Scoping (RLS-Equivalent)") were preserved unchanged, exactly as the delta intended.

---

## Known Risk Carried Forward (From Proposal, Not Resolved By This Change)

The proposal flagged that two stale, unarchived openspec folders — `openspec/changes/2026-07-09-pdf-export` and `openspec/changes/2026-07-09-payment-status-receipt-fix` — still assert the DIAN notice as mandatory in their own (never-merged) delta specs. This change correctly updated the MAIN spec (`openspec/specs/receipts/spec.md`) regardless. Whoever archives those two stale folders later should confirm their deltas don't silently re-assert the now-removed "Mandatory Legal Notice" requirement.

---

## SDD Cycle Complete

- **Proposal** (intent, scope, approach): committed in da56b09, archived copy in this folder
- **Spec** (requirements, scenarios): Engram #91, archived copy in this folder
- **Tasks** (work units, phases, verification gate): Engram #92, archived copy in this folder, all 18/18 complete
- **Apply** (implementation): da56b0943baeaa46783266dcb60d87c7ac558f1b, Engram #95
- **Verify** (test execution, compliance): Engram #96 (PASS WITH WARNINGS)
- **Archive** (specs synced, artifacts archived, this report): 2026-07-13-dian-notice-removal

---

## Next Steps

1. **Immediate**: None — archive complete for this run. The original `openspec/changes/dian-notice-removal/` working folder has already been deleted (contents copied here first). Only the git commit remains outstanding — per this project's "never commit unless explicitly asked" convention, no commit was made automatically as part of this archive pass; the orchestrator/user should review `git status`/`git diff` and commit.
2. **Recommended follow-up (separate change)**: Add a PDF-content-inspection regression test for `renderInvoicePdf`'s absence of DIAN/tax-authority text (see Warning #1 above).
3. **Deferred**: Reconcile the two stale, unarchived openspec folders (`2026-07-09-pdf-export`, `2026-07-09-payment-status-receipt-fix`) to confirm their own delta specs don't re-assert the removed requirement — out of scope for this change, flagged for whoever archives them.

---

**Archive Date**: 2026-07-13
**Archived By**: sdd-verify executor (performing combined verify+archive per explicit orchestrator instruction for this run)
**Final Status**: READY FOR NEXT CHANGE — pending only a commit by the orchestrator/user (original change folder already deleted, archive files and spec merge already written).
