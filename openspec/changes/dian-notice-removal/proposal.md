# Proposal: Remove DIAN Legal Notice from Receipts and PDFs

## Intent

Phase 6a of the approved "Fase 2" plan (item 1): "El mensaje de factura de Dian quitarlo." The DIAN notice is currently a spec-governed MANDATORY requirement (`openspec/specs/receipts/spec.md`, "Mandatory Legal Notice"), rendered on every printable invoice/payment receipt and the single-invoice PDF export. This is a governed removal, not a drive-by deletion: it must update the spec, code, tests, and docs together so nothing is left asserting a requirement that no longer exists.

## Scope

### In Scope
- Delete `components/domain/receipts/dian-notice.tsx` and its 2 render call sites (`app/(print)/invoices/[id]/receipt/page.tsx`, `app/(print)/payments/[id]/receipt/page.tsx`).
- Remove the duplicated `DIAN_NOTICE` const and its usage in `lib/export/pdf.ts` (`renderInvoicePdf`).
- Update 3 test files to assert the notice is ABSENT (not delete-and-leave-a-gap): `page.test.tsx` (invoices), `page.test.tsx` (payments, 2 assertions), `e2e/smoke.spec.ts`.
- Update 4 docs to drop DIAN-notice-as-requirement language: `docs/security-plan.md` ("Aviso legal de documentos" section + checklist item), `docs/mvp-scope.md`, `docs/ui-ux-flow.md`, `docs/testing-plan.md`.
- Delta spec against `openspec/specs/receipts/spec.md`: REMOVE the "Mandatory Legal Notice" requirement.

### Out of Scope
- Any change to invoice/payment/dashboard PDF exports beyond the DIAN const (list PDFs never used it).
- Reconciling the two stale, unarchived openspec folders noted below.
- Any new legal/compliance notice to replace it — this is a straight removal, not a substitution (no evidence of a replacement requirement from the plan).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `receipts`: remove the "Mandatory Legal Notice" requirement; printable views and invoice PDF no longer display any DIAN-related text.

## Approach

Straight deletion across code/tests/docs/spec in one PR. No precedent for a `REMOVED` delta exists yet in this repo's change history (only `ADDED` blocks found in `2026-07-09-pdf-export` and `2026-07-09-payment-status-receipt-fix`), so this proposal uses the standard openspec convention: `REMOVED Requirements` with `(Reason: ...)`. Tests are rewritten to assert absence (`expect(screen.queryByText(...)).not.toBeInTheDocument()` / equivalent Playwright `not.toBeVisible()`), proving the removal per this session's "test coverage proves behavior" convention.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `components/domain/receipts/dian-notice.tsx` | Removed | Delete file |
| `app/(print)/invoices/[id]/receipt/page.tsx` | Modified | Remove `<DianNotice/>` import + call |
| `app/(print)/payments/[id]/receipt/page.tsx` | Modified | Remove `<DianNotice/>` import + call |
| `lib/export/pdf.ts` | Modified | Remove `DIAN_NOTICE` const + usage in `renderInvoicePdf` |
| `app/(print)/invoices/[id]/receipt/page.test.tsx` | Modified | Assert absence instead of presence |
| `app/(print)/payments/[id]/receipt/page.test.tsx` | Modified | Assert absence (2 assertion sites) |
| `e2e/smoke.spec.ts` | Modified | Assert absence at end of flow |
| `docs/security-plan.md`, `docs/mvp-scope.md`, `docs/ui-ux-flow.md`, `docs/testing-plan.md` | Modified | Remove notice-as-requirement language |
| `openspec/specs/receipts/spec.md` | Modified (delta) | REMOVE "Mandatory Legal Notice" requirement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Two stale, unarchived openspec folders (`2026-07-09-pdf-export`, `2026-07-09-payment-status-receipt-fix`) still assert the DIAN notice as mandatory in their own delta specs | Low now / Medium later | This change updates the MAIN spec correctly regardless; flagged here so whoever archives those folders later checks their deltas don't silently re-assert the removed requirement |
| Removal reads as accidental drift rather than an intentional legal/compliance decision | Low | Spec delta + doc updates make the removal explicit and traceable to the Fase 2 plan |
| Test rewrites could pass by accident (never actually rendering the notice) rather than proving removal | Low | Assertions target the exact rendered surface (`screen`, Playwright locator) previously used to assert presence, now asserting absence at the same location |

## Rollback Plan

Single PR, fully reversible via `git revert`: restores `dian-notice.tsx`, the two call sites, `DIAN_NOTICE` in `lib/export/pdf.ts`, prior test assertions, docs text, and the spec requirement in one commit.

## Dependencies

None.

## Success Criteria

- [ ] No printable invoice/payment receipt or invoice PDF renders any DIAN notice text
- [ ] All 3 updated test files assert absence and pass
- [ ] `openspec/specs/receipts/spec.md` no longer contains "Mandatory Legal Notice"
- [ ] `npm run test` and `npm run build` pass

## Proposal question round — resolved

1. **Business reason**: straight removal, no replacement, per the user's original plan wording ("quitarlo").
2. **Scope boundary**: multi-record PDF exports confirmed out of scope — they never referenced `DIAN_NOTICE`.
3. **Stale folder handling**: `2026-07-09-pdf-export` and `2026-07-09-payment-status-receipt-fix` left as-is, flagged as a known risk for whoever archives them later — not acted on in this change.
4. **Doc tone**: delete the DIAN-notice-as-requirement lines outright from `docs/mvp-scope.md`/`docs/testing-plan.md` (and the other affected docs) — no replacement note.
