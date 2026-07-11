# Exploration: Introduce node-pg-migrate as build-time migration runner

## Current State

`lib/db/migrate.ts` (134 lines) exports `ensureMigrated()`: a memoized (`let migrated = false`) async function run lazily on first DB access per warm serverless instance. It issues 7 `CREATE TABLE IF NOT EXISTS` blocks (businesses, profiles, customers, invoice_sequences, invoices, invoice_items, payments) plus 6 `CREATE INDEX IF NOT EXISTS` and 2 demo seed `INSERT ... ON CONFLICT DO NOTHING` statements, all via the `sql` tagged-template from `lib/db/client.ts`. No versioning/history table exists today; re-running is safe only because every statement is idempotent.

`lib/db/client.ts` builds `sql` via `@neondatabase/serverless`'s `neon()` HTTP driver, with connection-string fallback chain `POSTGRES_URL || DATABASE_URL || POSTGRES_URL_NON_POOLING || DATABASE_URL_UNPOOLED`. `isDbConfigured` gates real-Postgres vs `lib/mock/*` repos.

`.env.example` only documents `POSTGRES_URL` — non-pooling variants are referenced in code but undocumented for local setup. `package.json`'s `"build"` script is plain `"next build"` — no pre-build step. `next.config.ts` only sets `serverExternalPackages: ["pdfkit", "exceljs"]`. `.gitignore` has no rule that would touch a new `migrations/` folder at repo root.

## Affected Areas

- `lib/db/migrate.ts` — source DDL for the first migration file; `ensureMigrated()` fully retired once migrations run at build time.
- `lib/db/client.ts` — unchanged; stays the HTTP `neon()` runtime driver for all `*-repo.ts` files. `pg`/`node-pg-migrate` must NOT be imported here.
- `package.json` — needs new devDependencies (`node-pg-migrate`, `pg`, `@types/pg`), a `"migrate"` script, and a `"vercel-build"` script running `node-pg-migrate up` before `next build`.
- `.env.example` — should document the non-pooled connection var to use for migrations.
- New `migrations/` directory at repo root (node-pg-migrate's default) — first migration captures the current schema baseline.

## Approaches Considered

1. **Direct (non-pooled) connection for node-pg-migrate, HTTP driver unchanged for runtime** (recommended) — node-pg-migrate uses `pg` (TCP) against `POSTGRES_URL_NON_POOLING`/`DATABASE_URL_UNPOOLED`; app runtime keeps pooled `POSTGRES_URL` via `@neondatabase/serverless`. Avoids pgbouncer transaction-pooling issues with `pg`'s extended protocol; matches Neon's guidance to use the direct string for schema-changing tools; `pg`/`node-pg-migrate` stay devDependencies, no runtime bundle impact.
2. Reuse pooled `POSTGRES_URL` for node-pg-migrate too — simpler env story but higher risk of intermittent DDL failures/lock timeouts under pgbouncer as schema changes grow.
3. Keep `ensureMigrated()` alongside node-pg-migrate — rejected: two sources of schema truth, defeats the point.

## Recommendation

Approach 1. Add `node-pg-migrate` + `pg` + `@types/pg` as devDependencies; point node-pg-migrate at the non-pooled connection string; add a `migrate` script wired into a `vercel-build` script; create `migrations/` with a single baseline `.sql` migration mirroring the current DDL — **written as idempotent `CREATE TABLE/INDEX IF NOT EXISTS`** (not plain `CREATE TABLE`), so it's a safe no-op against the already-existing production Neon database (which already has these 7 tables from the old `ensureMigrated()`) while still creating everything from scratch on a fresh database. Move the demo seed out of versioned schema migrations into a separate idempotent seed step. Delete `ensureMigrated()` and its call sites once verified.

## Risks

- Missing non-pooled env var in some environment breaks the build hard, unlike the old lazy/graceful runtime bootstrap — needs `.env.example` docs and a clear failure message.
- Local `npm run build` for contributors without any DB (`DATA_BACKEND=mock`) would break if `build` unconditionally requires Postgres — favor `vercel-build`-only wiring (Vercel calls `vercel-build` instead of `build` automatically when present) or a guard that skips migration when no connection string exists, so local mock-only dev is unaffected.
- Splitting demo seed data out of `ensureMigrated()` changes when/how it runs and needs its own idempotency story.
- **Existing deployed Neon database already has the 7 tables** (created by old `ensureMigrated()`) — the baseline migration must not blindly re-run plain `CREATE TABLE`; using `IF NOT EXISTS` throughout the baseline migration resolves this without needing to manually bootstrap the `pgmigrations` tracking table.
- Should verify `pg`/`node-pg-migrate` don't get traced into the Vercel serverless function bundle (no runtime code imports them, but worth an explicit build-output check).

## Ready for Proposal

Yes — scope is bounded (2-3 devDependencies, one config/script edit, one baseline migration, retirement of one file). Open decisions (exact env var name to standardize on, seed-as-migration-vs-script, existing-DB baseline strategy) are resolved above and ready to formalize in `sdd-propose`/`sdd-design`.
