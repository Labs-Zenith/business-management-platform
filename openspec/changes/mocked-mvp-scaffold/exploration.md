# Exploration: mocked-mvp-scaffold

## Current State

Repo is code-empty (Fase 0/docs-only): no `package.json`, app code, or lockfile — only `README.md`, `docs/*.md`, `openspec/{config.yaml, specs/, changes/archive/}`, and `.atl/`. Confirmed tooling: Node v22.15.0, npm 10.9.2 (no pnpm/yarn), Supabase CLI 2.33.9 unused for this change. `openspec/config.yaml` confirms `strict_tdd: false`, `test_runner: none`, and hard rules: `business_id`/`status`/computed totals always server-derived, financial mutations atomic, layered architecture required.

## Goal

Build the entire Fase 1 MVP (per `docs/roadmap.md`) with a fully mocked backend (no real Supabase project exists yet). Ports-and-adapters: UI, Forms, API routes, Zod validation, and services are production-real; only the data-access layer (`lib/mock/`) is mocked, behind repository interfaces (`lib/services/ports.ts`) wired through a single swap point (`lib/services/repositories.ts`).

## Affected Areas (all net-new)

- `package.json` / lockfile — Next.js 15 (App Router) + TS + React 19, npm only.
- `app/(auth)/`, `app/(dashboard)/`, `app/api/**` — all screens from `ui-ux-flow.md` + REST routes from `api-spec.md`.
- `components/{ui,layout,domain}` — shadcn/ui incl. `Skeleton`; `dynamic()`/`ssr:false` for swagger-ui-react, invoice items form, payment form, customer form dialog.
- `lib/schemas/` — strict Zod schemas rejecting client-supplied `business_id`/`status`/totals/`number`/`customer_id`.
- `lib/services/ports.ts` — repository interfaces (Customer/Invoice/Payment/Business), plus an Auth/session port.
- `lib/services/repositories.ts` — single swap point.
- `lib/mock/` — mocked data-access layer emulating atomic invoice numbering and payment-locking/overpay rules from `database-model.md`.
- `lib/openapi/` — `/api/openapi.json` + `/api/docs` (Swagger UI).
- `.env.example` — placeholder vars per `deployment-plan.md`.

## Approaches Considered (mock data-access layer)

1. **In-memory singleton store** (globalThis-cached, business_id-scoped mutex) — Low effort, zero new deps, forces business rules into services. **Recommended.**
2. **JSON-file-backed store** — persists across restarts, but adds file I/O concurrency footguns for a throwaway layer. Medium effort.
3. **Embedded SQLite (better-sqlite3)** — closest parity to future Postgres, but a real native dependency purely to discard later, with no RLS equivalent anyway. Medium-High effort.

**Recommendation**: Option 1.

## Risks / Open Decisions for sdd-propose

1. **"Negocio" API gap**: `ui-ux-flow.md`/`mvp-scope.md` expect an editable business-profile screen; `api-spec.md` defines no corresponding endpoint. Resolve: add vs. descope.
2. **Auth/session gap for a mocked backend**: needs an explicit minimal mocked `AuthPort`/session resolver in `lib/services/ports.ts` so route guards and `business_id` resolution are production-real now and swappable later.
3. **swagger-ui-react + React 19 peer-dependency conflict**: `swagger-ui-react` ≥5.18 declares `peerDependencies: react@">=16.8.0 <19"`, with open issues under Next 15/React 19 strict mode. Options: install with `--legacy-peer-deps`/`--force`, or switch to an alternative (e.g. Scalar API Reference).
4. **shadcn/ui + Tailwind**: shadcn/ui officially supports Tailwind v4 + Next 15 + React 19 — no blocker, but design should assume Tailwind v4 conventions (`@tailwindcss/postcss` + `@theme` in CSS), not v3's `tailwind.config.ts`.
5. **Money/decimal math**: `numeric(12,2)` fields with exact rounding (`line_total = quantity * unit_price`). Decide integer-cents vs. consistent rounding helper vs. decimal library.
6. **Test runner introduction**: this change installs Vitest/Testing Library/Playwright (none exist yet) — re-run `sdd-init` detection afterward so `strict_tdd` flips to `true` with real test/build commands.
7. **Scope size vs. 400-line PR budget**: entire Fase 1 MVP surface (9+ screens, ~10 API routes, schemas, services, mock layer, OpenAPI docs). `auto-chain` delivery strategy already selected; `sdd-tasks` needs an explicit multi-PR slicing forecast.
8. **Date/timezone handling for `overdue` status**: `due_date` is date-only, business locale COP/Colombia — document the server timezone assumption used for the overdue comparison.

## Ready for Proposal

Yes. `sdd-propose` should explicitly resolve: (1) Negocio endpoint, (2) mocked AuthPort/session design, (3) swagger-ui-react peer-dep handling, (4) money representation, (5) PR-slicing plan.
