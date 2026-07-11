# Archive Report: node-pg-migrate-setup

**Change**: node-pg-migrate-setup
**Archive Date**: 2026-07-11
**Artifact Store Mode**: hybrid (openspec + Engram)
**Status**: ARCHIVED (PASS WITH WARNINGS)

## Closure Summary

The node-pg-migrate build-time migration runner change has been successfully implemented, verified (PASS WITH WARNINGS), and archived. All in-sandbox verifiable work (Phases 1-5, 19/22 tasks) is complete and correct. Baseline migration is idempotent (IF NOT EXISTS throughout), ensuring safe deployment to both production (no-op) and fresh databases (full schema provisioning). The runtime isolation requirement is verified: zero runtime imports of `pg` or `node-pg-migrate`, all tooling declared as devDependencies only.

Two non-blocking warnings carry forward as **post-deploy follow-ups**, not blockers:
1. **Preview-deploy preview-branch binding**: Confirm that all preview/staging environments get an attached Neon database branch before the first deploy, or gate the `migrate` script. Without a branch, `migrate` will fail loudly (by design), blocking the preview build.
2. **seed.ts import-style deviation**: Implementation uses `@/lib/mock/fixtures/data` (project-wide alias convention, verified working) instead of design.md's relative-import snippet. Functionally correct, but documents a minor design-code drift for future readers.

Three Phase 6 tasks remain unchecked as explicitly deferred, requiring live Vercel/Neon environment:
- 6.1: Real migration run against a Neon branch (assert `pgmigrations` tracking + table creation)
- 6.2: Live Vercel build (verify `vercel-build` script ordering and failure propagation)
- 6.3: Serverless bundle inspection (confirm migration tooling excluded from runtime)

## Artifact Observation IDs (Engram, for traceability)

| Artifact | Observation ID | Type |
|----------|---|---|
| Proposal | #22 | architecture |
| Spec (migration-system) | #23 | architecture |
| Design | #24 | architecture |
| Tasks | #25 | architecture |
| Verify-Report | #27 | architecture |

All artifacts are `active` and stable as of 2026-07-11 18:52:17 UTC.

## Specs Synced to Main

| Domain | Action | Observation |
|--------|--------|---|
| migration-system | Created (new baseline) | `openspec/specs/migration-system/spec.md` — full spec copied from delta (no merge needed; this is the first spec in the domain). Contains all 6 requirements: Non-Pooled Migration Connection, Runtime/Migration Isolation, Build-Time Migration Execution, Local Dev/Build Independence, Idempotent Baseline Migration, Separate Idempotent Seed Step, Retirement of ensureMigrated(), Single System of Record for Schema Changes. |

## Archive Contents

Archive folder: `openspec/changes/archive/2026-07-11-node-pg-migrate-setup/`

- proposal.md — Full scope, approach, risks, rollback plan
- design.md — Technical architecture, file changes, interfaces, migration/rollout strategy
- tasks.md — All 22 tasks across Phases 1-6; Phases 1-5 complete (19/22), Phase 6 deferred
- verify-report.md — PASS WITH WARNINGS, spec compliance matrix, deferred-vs-failed distinction
- exploration.md — Current state, approaches considered, recommendation rationale
- specs/migration-system/spec.md — All 6 requirements and their scenarios

## Task Completion Status

- **Phases 1-5**: 19/22 tasks complete, all checked ✓
  - Phase 1 (Dependencies & Marker Verification): 2/2 ✓
  - Phase 2 (Baseline Migration & Scripts): 3/3 ✓
  - Phase 3 (Wiring): 2/2 ✓
  - Phase 4 (Retire ensureMigrated): 6/6 ✓
  - Phase 5 (Local Verification): 6/6 ✓

- **Phase 6** (Deferred — Live Vercel/Neon only): 0/3 ☐
  - 6.1: [DEFERRED] Real Neon branch migration run
  - 6.2: [DEFERRED] Live Vercel build verification
  - 6.3: [DEFERRED] Serverless bundle trace

**Note**: Phase 6 tasks are legitimately unverifiable in this sandbox (no live Neon credentials or Vercel build access). They are NOT stale checkboxes; they are intentional deferrals documented in the proposal/design/verify-report and require the user's post-deploy sign-off.

## Post-Deploy Follow-Ups (Non-Blocking Warnings)

### 1. Preview Deploy Database Branch Binding

**Risk**: Preview/staging environments without an attached Neon database branch will fail at the `migrate` step during Vercel build (loud, by design per design.md). The failure will block the preview build.

**Resolution**: Before relying on preview deploys post-merge, confirm one of:
- All preview/staging environments automatically get a Neon database branch attached (check Neon integration settings in Vercel)
- OR manually gate the `migrate` script to skip when no non-pooled connection string is available (e.g., add a guard in `scripts/db-migrate.mjs`)

**Timing**: Confirm before or at first preview deploy attempt.

### 2. seed.ts Import Style Deviation

**Observation**: `lib/db/seed.ts` uses the `@/lib/mock/fixtures/data` alias import (project-wide convention, verified working via `npx tsx` test and full `npm run build`/`typecheck` pass) instead of the relative import `../mock/fixtures/data` in design.md's code snippet.

**Status**: Functionally verified correct. No spec violation — both approaches work. Documented here for future readers who trace only design.md text without verifying actual implementation.

**Action**: None required; this is a note for future maintainers.

## Verification Evidence Summary

All in-sandbox verifiable requirements met and independently confirmed:

| Layer | Evidence |
|---|---|
| Baseline idempotency | Every CREATE TABLE/INDEX uses IF NOT EXISTS; markers well-formed |
| No stale references | `grep ensureMigrated` returns zero in actual code (`lib/`, `app/`); only in planning docs |
| Mock path intact | 257/257 vitest tests pass; mock repos untouched |
| Type safety | `npm run typecheck` passes clean |
| Lint compliance | `npm run lint` passes clean |
| Build independence | `npm run build` succeeds with no DB configured (mock backend only) |
| Runtime isolation | `grep "node-pg-migrate\|from \"pg\"" lib/ app/` returns zero matches |

Deferred verification (Phase 6) requires live environment and user sign-off:
- Real Neon migration run (assert `pgmigrations` table + 7 tables/indexes created)
- Live Vercel build (verify script ordering and failure propagation)
- Serverless bundle trace (confirm tooling absent from runtime)

## Design Decisions Frozen in Archive

1. **Non-pooled connection via wrapper script** (`scripts/db-migrate.mjs`): Explicitly resolves fallback chain to avoid silent env-var errors. Chosen over single `--database-url-var` flag to support multiple Neon integration versions.

2. **Seed via HTTP `sql` client** (not new `pg` connection): Keeps one connection config, adds no runtime `pg` coupling. Idempotent via `ON CONFLICT DO NOTHING`.

3. **Baseline is raw .sql with markers**: Transparent, diff-friendly, matches node-pg-migrate convention. Idempotent via `IF NOT EXISTS`, safe no-op on existing prod DB.

4. **Vercel-build-only wiring**: Keeps local `npm run dev`/`build` DB-free; Vercel auto-invokes `vercel-build` script, so migrations run only at deploy time.

## No Destructive Changes

The baseline migration uses `IF NOT EXISTS` for all tables and indexes. This ensures:
- Production deployment: No-op (7 tables already exist from old `ensureMigrated()`)
- Fresh branch/staging: Full provisioning (all 7 tables + 6 indexes created)
- Rollback safety: Revert PR restores `ensureMigrated()` and call sites; no data loss risk

The `pgmigrations` tracking table created by node-pg-migrate can be left inert on rollback.

## SDD Cycle Complete

- Proposal (APPROVED): Scope, approach, risks, rollback plan documented
- Spec (APPROVED): 6 requirements across 8 scenarios, all verifiable
- Design (APPROVED): Architecture, file changes, interfaces, testing strategy
- Tasks (APPROVED): 22 implementation + verification tasks across 6 phases
- Apply (COMPLETED): All Phases 1-5 implemented; Phase 6 deferred per plan
- Verify (PASS WITH WARNINGS): 19/22 tasks verified; 2 non-blocking warnings noted; Phase 6 legitimately deferred
- Archive (COMPLETED): Specs merged to main, change folder moved to archive, post-deploy follow-ups recorded

The change is ready for merge. Phase 6 tasks and both non-blocking warnings should be actioned post-deploy by the user.

---

**Archived by**: sdd-archive executor
**Timestamp**: 2026-07-11 19:00:00 UTC
**Next**: No further SDD cycles needed; ready for PR/merge. User must confirm Phase 6 and post-deploy follow-ups after deployment to production.
