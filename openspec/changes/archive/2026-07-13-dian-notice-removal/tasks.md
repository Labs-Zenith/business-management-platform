# Tasks: Remove DIAN Legal Notice from Receipts and PDFs

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~70-90 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full removal: code + tests + docs + spec delta already recorded | PR 1 (single) | Base: main. Straight deletion, fully reversible via `git revert`. |

## Phase 1: Code Removal (satisfies "No DIAN/Tax-Authority Notice" requirement)

- [x] 1.1 Delete `components/domain/receipts/dian-notice.tsx`.
- [x] 1.2 Remove `DianNotice` import and `<DianNotice />` call from `app/(print)/invoices/[id]/receipt/page.tsx`.
- [x] 1.3 Remove `DianNotice` import and `<DianNotice />` call from `app/(print)/payments/[id]/receipt/page.tsx`.
- [x] 1.4 Remove the `DIAN_NOTICE` const (line 7) and its two usage lines (`doc.moveDown(2)` + `doc.text(DIAN_NOTICE)`) in `renderInvoicePdf` from `lib/export/pdf.ts`.

## Phase 2: Test Updates — Assert Absence (satisfies delta scenarios: "No DIAN notice on printable invoice/payment receipt", "No DIAN notice in invoice PDF export")

- [x] 2.1 In `app/(print)/invoices/[id]/receipt/page.tsx`'s test file, replace the DIAN-notice assertion/test name with `expect(screen.queryByText("Documento interno, no valido como factura electronica DIAN.")).not.toBeInTheDocument()`.
- [x] 2.2 In `app/(print)/payments/[id]/receipt/page.test.tsx`, update both assertion sites (the main render test and the missing-payment mock-fallback test) to assert absence via `queryByText(...).not.toBeInTheDocument()`.
- [x] 2.3 In `e2e/smoke.spec.ts`, update the receipt-page step (and its preceding comment/JSDoc) to assert `page.getByText("Documento interno, no valido como factura electronica DIAN.")` is NOT visible (`.not.toBeVisible()` or `expect(count).toBe(0)`).

## Phase 3: Documentation Updates (delete notice-as-requirement language, no replacement)

- [x] 3.1 `docs/security-plan.md`: delete the "Aviso legal de documentos" section (lines ~160-167) and the "Comprobantes incluyen aviso DIAN." checklist item (line ~180).
- [x] 3.2 `docs/mvp-scope.md`: delete the `Aviso visible: "Documento interno..."` bullet (line ~67). Leave the unrelated "Fuera de alcance" DIAN-integration bullets untouched.
- [x] 3.3 `docs/ui-ux-flow.md`: delete the "Aviso DIAN." bullet (line ~219).
- [x] 3.4 `docs/testing-plan.md`: delete the "Confirmar aviso de documento interno no DIAN." bullet (line ~66).

## Phase 4: Verification Gate

- [x] 4.1 Run `npm run typecheck` — must pass with no dangling `DianNotice`/`DIAN_NOTICE` references.
- [x] 4.2 Run `npm run lint` — must pass.
- [x] 4.3 Run `npm run test` — the 3 updated test files pass, proving absence.
- [x] 4.4 Run `npm run build` — must succeed.
- [x] 4.5 Confirm no repo string search for "DIAN" or "Documento interno, no valido" matches outside the delta spec's historical text (`openspec/changes/dian-notice-removal/specs/receipts/spec.md`) and the flagged stale folders (out of scope, per proposal risk #1).
