# Proposal: node-pg-migrate build-time migration runner

## Intent

Replace the runtime `ensureMigrated()` bootstrap in `lib/db/migrate.ts` (idempotent `CREATE TABLE IF NOT EXISTS`, no history) with `node-pg-migrate`, a versioned, tracked migration system that runs as a build-time step. This is the FIRST of several planned schema changes (roles/multi-tenant, expenses, payroll, inventory, audit log, feature flags). Establishing this foundation now means every subsequent schema change lands as a numbered, tracked migration instead of accreting more idempotent runtime DDL.

## Scope

### In Scope
- Add `node-pg-migrate`, `pg`, `@types/pg` as **devDependencies only**.
- `migrate` + `vercel-build` npm scripts (`node-pg-migrate up` then `next build`).
- Single baseline `migrations/` file mirroring the current 7-table schema.
- Separate idempotent demo-seed step (business + profile), moved out of DDL.
- Delete `ensureMigrated()` and its 4 call sites after parity is verified.
- Document the non-pooled connection var in `.env.example`.

### Out of Scope
- Any NEW tables (roles, expenses, payroll, inventory, audit log, feature flags) — each is a **separate future SDD change** adding its own migration file on this system.
- Changing runtime data access — `lib/db/client.ts` and `*-repo.ts` stay on the pooled HTTP `neon()` driver, unchanged.
- Local dev/build requiring a DB — mock backend keeps working with zero setup.

## Capabilities

### New Capabilities
- `db-migrations`: versioned, build-time schema migration system with tracked history (`pgmigrations`), a baseline migration, and a separate seed step.

### Modified Capabilities
None. No spec-level behavior of `business-profile`, `customers`, `invoices`, or `payments` changes — only how their schema is provisioned.

## Approach

Exploration Approach 1: `node-pg-migrate` uses `pg` (TCP) against the NON-pooled string (`DATABASE_URL_UNPOOLED` first, `POSTGRES_URL_NON_POOLING` fallback), avoiding pgbouncer DDL issues. Runtime keeps the pooled `POSTGRES_URL` via `@neondatabase/serverless` HTTP. Baseline uses `CREATE TABLE/INDEX IF NOT EXISTS` so it is a safe no-op on the already-deployed prod DB (7 tables exist) yet fully provisions a fresh preview/dev branch. Vercel auto-prefers `vercel-build`, so the migration runs only in the Vercel build context.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/db/migrate.ts` | Removed | Source DDL for baseline; file retired |
| `lib/db/business-repo.ts`, `customer-repo.ts`, `invoice-repo.ts`, `payment-repo.ts` | Modified | Drop `ensureMigrated()` calls |
| `package.json` | Modified | devDeps + `migrate`/`vercel-build` scripts |
| `migrations/` | New | Baseline migration (repo root) |
| `.env.example` | Modified | Document non-pooled var |
| `lib/db/client.ts` | Unchanged | HTTP runtime driver; must NOT import `pg` |

## Multi-tenant / business_id Impact

N/A — this change touches no business data and no row-level access paths. It is pure schema tooling; the baseline reproduces the existing schema exactly. Multi-tenant/`business_id` design belongs to the later roles/multi-tenant change.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing non-pooled env var breaks build | Med | Document in `.env.example`; clear failure message; `vercel-build`-only wiring |
| Baseline re-run on existing prod DB | Low | `IF NOT EXISTS` throughout → no-op |
| `pg`/`node-pg-migrate` traced into serverless bundle | Low | devDeps only, no runtime import; verify build output |
| Seed step drifts from old behavior | Low | Keep `ON CONFLICT DO NOTHING` idempotency |

## Rollback Plan

Revert the PR: restore `ensureMigrated()` and its call sites, remove devDeps/scripts/`migrations/`. The `pgmigrations` table can be left in place (inert) or dropped. Because the baseline is `IF NOT EXISTS`, no destructive schema change occurs, so rollback carries no data-loss risk.

## Dependencies

- Neon non-pooled connection string available in the Vercel build environment.

## Success Criteria

- [ ] `vercel-build` runs migrations then `next build`; deploy succeeds.
- [ ] Fresh DB branch gets all 7 tables + indexes; prod DB is a no-op.
- [ ] Seed runs idempotently outside versioned migrations.
- [ ] `ensureMigrated()` and call sites removed; no runtime DB regression.
- [ ] Local `npm run dev`/`build` work with mock backend, no DB needed.
- [ ] `pg`/`node-pg-migrate` absent from serverless function bundle.
