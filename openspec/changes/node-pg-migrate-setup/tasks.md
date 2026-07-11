# Tasks: node-pg-migrate build-time migration runner

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250-300 (net: +~140 new files, ~150 deletions from `migrate.ts` + repo call-site cleanup) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending (not needed at this size) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full migration-system swap (deps, baseline SQL, scripts, seed, repo cleanup, verification) | PR 1 | Single contained PR per design's "Migration / Rollout"; rollback = revert PR |

## Phase 1: Dependencies & Marker Verification

- [x] 1.1 Add devDependencies to `package.json`: `node-pg-migrate ^7.9.0`, `pg ^8.13.0`, `@types/pg ^8.11.0`, `tsx ^4.19.0`; run install to update lockfile.
- [x] 1.2 After install, check `node_modules/node-pg-migrate` docs/CHANGELOG for the exact v7 SQL marker syntax (`-- Up Migration` / `-- Down Migration`) — resolves design's open question before writing the baseline file.

## Phase 2: Baseline Migration & Scripts (Foundation)

- [x] 2.1 Create `migrations/1700000000000_baseline.sql` with all 7 tables + indexes copied verbatim from `lib/db/migrate.ts`, all `IF NOT EXISTS`, using the marker syntax confirmed in 1.2.
- [x] 2.2 Create `scripts/db-migrate.mjs`: resolve `DATABASE_URL_UNPOOLED` → `POSTGRES_URL_NON_POOLING` → `DATABASE_URL` → `POSTGRES_URL`, set as `DATABASE_URL`, `spawnSync("node-pg-migrate", ["-m","migrations",...argv])`; exit 1 with actionable message if none set.
- [x] 2.3 Create `lib/db/seed.ts`: import `sql`/`isDbConfigured` from `./client`; no-op + exit 0 if `!isDbConfigured`; two `ON CONFLICT DO NOTHING` inserts (businesses, profiles) reusing fixtures from `lib/mock/fixtures/data`.

## Phase 3: Wiring

- [x] 3.1 Update `package.json` scripts: add `migrate`, `migrate:create`, `seed`, `vercel-build` (per design); keep `build` as plain `next build`.
- [x] 3.2 Update `.env.example`: add `DATABASE_URL_UNPOOLED` and `POSTGRES_URL_NON_POOLING` with the explanatory comment, below `POSTGRES_URL`.

## Phase 4: Retire ensureMigrated (Cleanup)

- [x] 4.1 Remove import (L3) + call (L31) in `lib/db/business-repo.ts`.
- [x] 4.2 Remove import (L15) + 4 calls (L143,172,205,215) in `lib/db/customer-repo.ts`.
- [x] 4.3 Remove import (L15) + 3 calls (L162,178,186) in `lib/db/invoice-repo.ts`.
- [x] 4.4 Remove import (L4) + 3 calls (L53,61,75) in `lib/db/payment-repo.ts`.
- [x] 4.5 Delete `lib/db/migrate.ts`.
- [x] 4.6 `grep -r ensureMigrated .` (excluding `node_modules`) — confirm zero references remain.

## Phase 5: Local Verification (no live DB in this sandbox)

- [x] 5.1 Read `migrations/1700000000000_baseline.sql`; confirm every `CREATE TABLE`/`CREATE INDEX` uses `IF NOT EXISTS` and Up/Down markers are well-formed.
- [x] 5.2 Run `npm run typecheck` — must pass with no dangling `migrate.ts`/`ensureMigrated` references.
- [x] 5.3 Run `npm run lint` — must pass.
- [x] 5.4 Run `npm run test` (vitest, mock backend) — must pass; confirms mock repos are untouched.
- [x] 5.5 Run `npm run build` (`next build`, no `POSTGRES_URL`/non-pooled var set) — must succeed via mock backend, no DB/migration attempt.
- [x] 5.6 `grep -rn "node-pg-migrate\|from \"pg\"\|from 'pg'" lib/ app/` (excluding `scripts/`) — confirm zero runtime imports of migration tooling.

## Phase 6: Deferred — Requires Live Vercel/Neon (not executable in this sandbox)

- [ ] 6.1 [DEFERRED] `vercel env pull` + `npm run migrate` against a Neon branch; assert a `pgmigrations` row + all 7 tables/indexes exist; re-run is a no-op.
- [ ] 6.2 [DEFERRED] Trigger a real Vercel build; confirm `vercel-build` runs `migrate` → `seed` → `next build` in order and a migration failure blocks the build.
- [ ] 6.3 [DEFERRED] Inspect the deployed serverless function trace/bundle; confirm `node-pg-migrate` and `pg` are absent from the runtime bundle.
