# Proposal: Mobile-First Dashboard Visuals

## Intent

Make the existing MVP UI consistently mobile-first and add lightweight visual dashboard charts so a business owner can scan receivables, debtors, and payment activity faster on phone and desktop. Apply the Vercel design theme requested by the user while preserving the existing Tailwind v4 + shadcn/ui architecture.

## Scope

### In Scope

- Apply `npx getdesign@latest add vercel` and reconcile generated theme tokens with `app/globals.css`.
- Add dashboard charts using `recharts`.
- Keep dashboard chart data server-computed and business-scoped through the existing service layer.
- Responsive pass on dashboard, list pages, detail pages, dialogs, and invoice creation form using Tailwind classes.
- Tests for new dashboard chart aggregation and responsive/rendering behavior where practical.

### Out of Scope

- Real Supabase, migrations, RLS policy changes, or external analytics.
- New dashboard API response fields unless implementation requires them for a public consumer.
- Branding beyond the Vercel/shadcn theme tokens.
- Replacing tables with a separate mobile card-list system in this pass.

## Multi-tenant / business_id Impact

Dashboard chart figures MUST be computed from data scoped by `session.businessId`, using the same repository calls and invoice status/balance rules already used by the dashboard summary. No client payload may provide `business_id`, status, totals, or chart inputs.

## Rollback Plan

Revert the change set. No database migrations or external state are involved. If the chart dependency creates build/runtime issues, remove `recharts` and keep the responsive Tailwind improvements independently.

## Success Criteria

- [ ] SDD artifacts validate before implementation.
- [ ] Dashboard shows visual charts for receivables/payment activity/top balances without cross-business leakage.
- [ ] Core screens are usable at mobile widths without page-level horizontal overflow from filters/forms/actions.
- [ ] Vercel theme tokens are applied without introducing a custom product palette.
- [ ] `npm run lint`, `npm run typecheck`, relevant Vitest tests, and Playwright smoke pass.
