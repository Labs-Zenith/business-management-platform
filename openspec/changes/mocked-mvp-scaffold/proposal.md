# Proposal: Mocked MVP Scaffold (Fase 1, ports-and-adapters)

## Intent

Repo is docs-only (Fase 0). Deliver the entire Fase 1 MVP surface — production-real UI, forms, Zod validation, API routes, and services — against a **fully mocked** data-access layer, because no real Supabase project exists yet. Ports-and-adapters isolates the mock behind `lib/services/ports.ts`, wired through the single swap point `lib/services/repositories.ts`, so real Supabase drops in later with minimal blast radius.

## Scope

### In Scope
- Next.js 15 (App Router) + TS + React 19 project, **npm only**.
- Mocked auth/session, route guards, server-resolved `business_id`.
- Business profile **read-only display** (no edit form, no `/api/business`).
- Customers CRUD; invoices with line items; payments (partial/full, overpay rejected, atomic per-business invoice numbering).
- Dashboard KPIs; printable receipts with legal notice: `Documento interno, no valido como factura electronica DIAN.`
- OpenAPI 3 doc + `/api/docs` via **Scalar API Reference**; `/api/openapi.json`.
- shadcn/ui Skeleton loading states; `dynamic()` lazy-loading for heavy client components.
- `lib/mock/` in-memory singleton store + seed fixtures; `.env.example` placeholders.
- Doc note in `docs/technical-architecture.md` recording the Swagger UI -> Scalar substitution.

### Out of Scope
- Real Supabase (DB/Auth/RLS), Vercel deploy, real migrations.
- Business-profile editing / `PATCH /api/business` (deferred).
- swagger-ui-react (React 19 peer conflict).

## Capabilities

### New Capabilities
- `mock-auth-session`: mocked login, session cookie, server-side `business_id` resolution, dashboard guard.
- `business-profile`: read-only display of the seeded business record.
- `customers`: CRUD scoped by `business_id`.
- `invoices`: create with items, server-computed totals, atomic per-business numbering, status lifecycle.
- `payments`: partial/full registration, overpay rejection, balance recompute.
- `dashboard`: server-computed KPIs.
- `receipts`: printable receipt view with DIAN legal notice.
- `api-docs`: OpenAPI 3 document + Scalar-rendered docs page.

### Modified Capabilities
- None (openspec/specs is empty).

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Negocio: **read-only**, no `/api/business` | User decision; editing deferred. |
| 2 | **Scalar** for `/api/docs` (renders same `/api/openapi.json`) | Avoids React 19 peer conflict; contract unchanged. |
| 3 | Minimal **`AuthPort`** in ports.ts: `getSession(): Session \| null` where `Session = { userId, businessId, email }`; mock adapter validates an opaque httpOnly cookie set by a mock login route against one seeded demo user | Route guards + `business_id` resolution built production-real now; real Supabase Auth adapter swaps in via same port + single swap point. |
| 4 | **Integer minor units (cents)** for all money; single rounding helper (round-half-up) at the one `line_total = quantity * unit_price` site; format only at edges | Zero deps ("evitar dependencias innecesarias"); deterministic; maps cleanly to future `numeric(12,2)`. |
| 5 | Introduce Vitest + Testing Library + Playwright as a **small preceding change**, then refresh sdd-init (`strict_tdd: true`) before this change's tasks | Keeps this large change focused; downstream phases inherit a real test baseline and commands. |

## Multi-tenant / business_id impact

`business_id` MUST be resolved from the session server-side, never trusted from client. Zod schemas reject client-supplied `business_id`/`status`/totals/`number`/`customer_id`. Mock services enforce isolation by filtering every read/write on `business_id` (no RLS in mock — isolation lives entirely in services, matching where docs require it long-term). Overdue status computed server-side; server timezone assumption **America/Bogota (COP)** documented.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mock isolation gap (no RLS) | Med | Centralize `business_id` filtering in services; test unauthorized cross-tenant access. |
| Concurrency emulation weak (single process) | Low | In-process mutex keyed by `business_id` for numbering/payment locking; sufficient for local mock. |
| Scope > 400-line PR budget | High | `auto-chain`; sdd-tasks slices into chained PRs per capability. |
| Swap-point leakage (mock types bleed into UI) | Med | UI/services depend only on `ports.ts` types, never `lib/mock/`. |

## Rollback Plan

Repo is code-empty, so rollback is `git revert`/branch-delete with zero data or infra impact — no migrations, no live services, no external state. The preceding test-runner change reverts independently.

## Dependencies

- Preceding test-runner change (decision 5).
- npm registry access for Next.js 15, React 19, shadcn/ui (Tailwind v4 flow), Zod, Scalar, Vitest/Playwright.

## Success Criteria

- [ ] Unauthenticated user cannot reach dashboard; mock login grants a session resolving `business_id`.
- [ ] Full customer -> invoice -> payment flow works end-to-end against the mock, totals/status/number server-derived.
- [ ] Overpay is rejected; invoice numbering is unique per business under the mock mutex.
- [ ] Printable receipt shows the DIAN legal notice; `/api/docs` renders via Scalar from `/api/openapi.json`.
- [ ] No UI/service code imports `lib/mock/` directly — only `ports.ts` / `repositories.ts`.

## Proposal question round

Scope is pre-validated; these residual product questions can refine specs without re-negotiating scope. Assumptions applied unless corrected:
1. Overdue computed against **America/Bogota** wall-clock, `due_date` date-only — confirm timezone.
2. Seed fixtures: **1 business, 1 demo user, ~8 customers, ~12 invoices (spanning all 4 statuses: pending, partially_paid, paid, overdue), several payments (mix of partial and full)** — corrected from the original ~2/~2/~1 proposal, which was too thin to demonstrate all invoice statuses required by the verification checklist.
3. On overpay attempt, reject with validation error and leave invoice unchanged (no partial apply) — confirm UX.
4. Currency display: COP, no decimal digits shown even though stored as minor units — confirm formatting.
