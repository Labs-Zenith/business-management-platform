# Proposal: Payment Status and Receipt Fallback Fix

## Intent

Fix two MVP issues: overdue invoices must become partially paid immediately after a valid partial payment, and payment receipt pages must not fail in the mocked environment when a payment reference is missing.

## Scope

- Preserve the current rule: `paid` > `partially_paid` > `overdue` > `pending`.
- Ensure payment registration on an overdue invoice returns and persists `partially_paid`.
- Render a mocked payment receipt fallback for missing mock payment records.
- No e2e automation for this change; manual verification is expected.

## Multi-tenant / business_id Impact

Payment mutations remain scoped by `session.businessId`. The fallback receipt is a mock-only display for missing data and MUST NOT return real data from another business.
