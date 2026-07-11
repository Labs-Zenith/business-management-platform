# Verification Report: node-pg-migrate-setup

**Change**: node-pg-migrate-setup
**Mode**: full artifacts (proposal, specs, design, tasks, apply-progress all present)
**Verdict**: PASS WITH WARNINGS

## Task Completeness

19/22 tasks checked `[x]` in `tasks.md` (Phases 1-5). Phase 6 (3 tasks) left `[ ]`,
explicitly labeled `[DEFERRED]` and requires a live Vercel/Neon deploy this sandbox
cannot perform. This is a legitimate, documented deferral (matches proposal's
Dependencies section and design's "Requires creds/deploy" note), not a completion gap.

| Phase | Status |
|---|---|
| 1. Dependencies & marker verification | Complete (2/2) |
| 2. Baseline migration & scripts | Complete (3/3) |
| 3. Wiring (package.json, .env.example) | Complete (2/2) |
| 4. Retire ensureMigrated | Complete (6/6) |
| 5. Local verification | Complete (6/6) |
| 6. Deferred (live Neon/Vercel) | 0/3 — legitimately unverifiable in sandbox |

## Build / Test / Lint Evidence (executed independently, not trusted from apply-progress)

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | PASS — clean, no output |
| `npm run lint` (eslint) | PASS — clean, no output |
| `npm run test` (vitest) | PASS — 257/257 tests, 45 files |
| `npm run build` (`next build`, no POSTGRES_URL/DB var set) | PASS — compiled successfully, 21 routes generated, no DB connection attempted |

`.env.local` confirmed to contain no `POSTGRES_URL`/`DATABASE_URL*` keys (checked via
key-only inspection, no secret values printed), so the build run above is a valid
zero-DB-configured evidence run per the "Local Dev/Build Independence" requirement.

## File-Existence / Content Checks

| Item | Result |
|---|---|
| `migrations/1700000000000_baseline.sql` exists | Confirmed |
| Baseline uses `IF NOT EXISTS` throughout (7 tables + 6 indexes) | Confirmed — every `CREATE TABLE`/`CREATE INDEX` has `IF NOT EXISTS`; `-- Up Migration` / `-- Down Migration` markers well-formed |
| `scripts/db-migrate.mjs` exists | Confirmed — resolves `DATABASE_URL_UNPOOLED` → `POSTGRES_URL_NON_POOLING` → `DATABASE_URL` → `POSTGRES_URL`, exits 1 with actionable message if none set, spawns `node-pg-migrate -m migrations <args>` |
| `lib/db/seed.ts` exists | Confirmed — idempotent (`ON CONFLICT DO NOTHING` x2), no-ops with exit 0 when `!isDbConfigured`, reuses pooled `sql` client (no new `pg` connection) |
| `lib/db/migrate.ts` deleted | Confirmed — `test -f` returns false |
| `ensureMigrated` references in `lib/` or `app/` | Confirmed zero — `grep -rn ensureMigrated` repo-wide (excluding node_modules/.git) only matches openspec planning docs (proposal.md, design.md, exploration.md, tasks.md — expected, historical/narrative text), never in `lib/`, `app/`, or any `.ts`/`.tsx` file |
| `node-pg-migrate`/`pg` imports in `lib/` or `app/` | Confirmed zero — `grep -rn "node-pg-migrate\|from \"pg\"\|from 'pg'" lib/ app/` → no matches (exit 1) |
| `package.json` scripts | Confirmed — `migrate`, `migrate:create`, `seed`, `vercel-build` all present; `build` stays plain `"next build"` |
| `node-pg-migrate`/`pg`/`@types/pg`/`tsx` in devDependencies only | Confirmed — absent from `dependencies` |
| `.env.example` documents non-pooled vars | Confirmed — `DATABASE_URL_UNPOOLED` and `POSTGRES_URL_NON_POOLING` present below `POSTGRES_URL` with explanatory comment |

## Spec Compliance Matrix (openspec/changes/node-pg-migrate-setup/specs/migration-system/spec.md)

| Requirement | Scenario | Status | Evidence |
|---|---|---|---|
| Non-Pooled Migration Connection | Migration runs against non-pooled string | VERIFIED (static) | `db-migrate.mjs` fallback chain confirmed by read; no live-DB run in sandbox |
| Non-Pooled Migration Connection | Missing non-pooled var fails clearly | VERIFIED | `db-migrate.mjs` exits 1 with actionable message when no var set (code inspection) |
| Runtime/Migration Isolation | Repo files stay on HTTP driver | VERIFIED | grep confirms zero `pg`/`node-pg-migrate` imports in `lib/`, `app/` |
| Runtime/Migration Isolation | Serverless bundle excludes migration tooling | DEFERRED (Phase 6.3) | Requires deployed serverless bundle inspection — not executable in sandbox |
| Build-Time Migration Execution | Vercel build applies migrations first | DEFERRED (Phase 6.2) | Requires live Vercel build — `vercel-build` script order (`migrate && seed && next build`) statically confirmed correct |
| Build-Time Migration Execution | Migration failure blocks deploy | VERIFIED (static) | `&&` chaining in `vercel-build` + `db-migrate.mjs`'s `process.exit(result.status ?? 1)` propagate non-zero exit; not exercised against a live failing migration |
| Local Dev/Build Independence | Dev works with no DB configured | VERIFIED | `npm run build` executed with no `POSTGRES_URL`/non-pooled var set — succeeded via mock backend |
| Idempotent Baseline Migration | Baseline is a no-op on prod | VERIFIED (static) | Every `CREATE TABLE`/`CREATE INDEX` uses `IF NOT EXISTS`; not run against actual prod Neon in this sandbox |
| Idempotent Baseline Migration | Baseline fully provisions a fresh branch | DEFERRED (Phase 6.1) | Requires live Neon branch run |
| Separate Idempotent Seed Step | Seed does not duplicate on rerun | VERIFIED (static) | `ON CONFLICT DO NOTHING` on both inserts; seed.ts is not part of `migrations/` DDL; not run twice against a live DB |
| Retirement of ensureMigrated() | No runtime bootstrap remains | VERIFIED | grep confirms zero references in `lib/db/migrate.ts` (file deleted) and all call sites |
| Single System of Record for Schema Changes | Future feature adds a migration file | N/A (forward-looking convention) | No test possible until a future change lands; convention is now structurally supported |

Note: "DEFERRED" items above map 1:1 to `tasks.md` Phase 6 (3 explicitly deferred
items: live Neon migration run, real `vercel-build` ordering against a live deploy,
serverless bundle trace). These are legitimately unverifiable in this sandbox (no
live Vercel/Neon credentials or deploy pipeline access) — they are NOT verification
failures, but they DO remain open risk until the user confirms them post-deploy.

## Design Coherence

Design followed closely. One documented, low-risk deviation:

- **`lib/db/seed.ts` import style**: design.md's literal snippet used a relative import
  (`../mock/fixtures/data`) to "avoid the alias resolver in tsx"; the actual implementation
  uses the `@/` alias (`@/lib/mock/fixtures/data`). apply-progress records this was
  deliberately verified working (`npx tsx lib/db/seed.ts` resolves the alias correctly via
  tsx's bundled `get-tsconfig`) before deviating. Confirmed independently: `seed.ts` uses
  `@/lib/mock/fixtures/data`, matches project-wide alias convention, and `npm run build`/
  `typecheck` both pass with this file in place. WARNING-level only — does not break any
  spec requirement.
- **Design's open question #2** ("Preview deploys without an attached Neon branch will
  fail at `migrate` ... confirm all preview envs get a DB branch, or gate migrate.") is
  NOT addressed by tasks.md or apply-progress — it was never resolved, only flagged.
  This is a real operational risk that should be confirmed by the user before/at first
  Vercel preview deploy after merge.

## Issues

**CRITICAL**: None.

**WARNING**:
1. Design's open question about preview-deploy behavior without an attached Neon DB
   branch (migrate would fail loudly on preview envs lacking a branch) was never
   explicitly resolved or gated — confirm this operationally before relying on preview
   deploys.
2. `seed.ts` deviates from design.md's literal relative-import snippet by using the `@/`
   alias instead — functionally verified correct, but a design/code drift worth noting
   for future readers who only trust design.md text.

**SUGGESTION**:
1. Once Phase 6 is executed against a live Neon branch/Vercel build, update tasks.md's
   remaining 3 checkboxes and archive the deferred-risk note in this report.

## Deferred (Not a Verification Failure)

The following 3 tasks are correctly left unchecked pending a real deploy; they cannot
be executed in this sandbox and require the user's post-deploy confirmation:

1. `vercel env pull` + `npm run migrate` against a live Neon branch (assert `pgmigrations`
   row + all 7 tables/indexes exist; re-run is a no-op).
2. Trigger a real Vercel build; confirm `vercel-build` runs `migrate` → `seed` → `next build`
   in order and that a migration failure blocks the build.
3. Inspect the deployed serverless function trace/bundle; confirm `node-pg-migrate` and
   `pg` are absent from the runtime bundle.

## Final Verdict

**PASS WITH WARNINGS**

All in-sandbox verifiable work (Phases 1-5, 19/22 tasks) is complete, correct, and
independently confirmed via source inspection plus real command execution
(`typecheck`, `lint`, `test`, `build` all green; targeted greps for `ensureMigrated`
and `pg`/`node-pg-migrate` runtime imports both return zero matches in `lib/`/`app/`).
Phase 6's 3 deferred items are legitimately out of scope for this sandbox and require
the user's post-deploy sign-off, not a rework. Two WARNING-level items (unresolved
preview-deploy open question; a minor design-vs-code import-style deviation) should be
acknowledged before archiving but do not block progression.
