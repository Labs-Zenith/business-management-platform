# Migration System Specification

## Purpose

Defines the versioned, build-time schema migration system (`node-pg-migrate`) that replaces the runtime `ensureMigrated()` bootstrap. Establishes the foundation every future schema change (roles, expenses, payroll, inventory, audit log, feature flags) MUST use.

## Requirements

### Requirement: Non-Pooled Migration Connection

The migration runner MUST use `node-pg-migrate` (via `pg`, TCP) against a non-pooled Postgres connection string, never the pooled HTTP runtime driver.

#### Scenario: Migration runs against non-pooled string

- GIVEN `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` is set in the build environment
- WHEN `npm run migrate` executes
- THEN `node-pg-migrate` connects using that non-pooled string
- AND no migration statement is sent over the pooled `POSTGRES_URL` HTTP driver

#### Scenario: Missing non-pooled var fails clearly

- GIVEN neither `DATABASE_URL_UNPOOLED` nor `POSTGRES_URL_NON_POOLING` is set
- WHEN `npm run migrate` executes in the Vercel build
- THEN the build fails with an explicit, actionable error message
- AND no partial migration is applied

### Requirement: Runtime/Migration Isolation

Runtime application code MUST NOT import `node-pg-migrate` or `pg`. `node-pg-migrate`, `pg`, and `@types/pg` MUST be declared as devDependencies only.

#### Scenario: Repo files stay on HTTP driver

- GIVEN any file under `lib/db/*-repo.ts` or `lib/services/*`
- WHEN its imports are inspected
- THEN it imports only `@neondatabase/serverless` (or mock backend), never `node-pg-migrate` or `pg`

#### Scenario: Serverless bundle excludes migration tooling

- GIVEN a production build/deploy completes
- WHEN the serverless function bundle is inspected
- THEN `node-pg-migrate` and `pg` are absent from the bundle output

### Requirement: Build-Time Migration Execution

Migrations MUST run automatically as part of Vercel's build, before `next build`, via a `vercel-build` script.

#### Scenario: Vercel build applies migrations first

- GIVEN a deploy is triggered on Vercel
- WHEN the `vercel-build` script runs
- THEN `node-pg-migrate up` completes successfully
- AND `next build` runs only after migrations succeed

#### Scenario: Migration failure blocks deploy

- GIVEN a migration fails during `vercel-build`
- WHEN the build script evaluates the exit code
- THEN the build stops with non-zero exit
- AND `next build` does not run

### Requirement: Local Dev/Build Independence

`npm run dev` and `npm run build` MUST NOT require a database connection when `POSTGRES_URL` is not configured; the mock backend MUST keep working standalone.

#### Scenario: Dev works with no DB configured

- GIVEN no `POSTGRES_URL` or non-pooled var is set locally
- WHEN a developer runs `npm run dev` or `npm run build`
- THEN the app starts/builds successfully using the mock backend
- AND no migration or DB connection attempt blocks the process

### Requirement: Idempotent Baseline Migration

The baseline migration MUST use `IF NOT EXISTS` for all tables/indexes and MUST NOT fail when run against the existing production schema.

#### Scenario: Baseline is a no-op on prod

- GIVEN the production database already has all 7 tables and indexes
- WHEN the baseline migration runs
- THEN it completes successfully with no schema changes
- AND `pgmigrations` records it as applied

#### Scenario: Baseline fully provisions a fresh branch

- GIVEN a new, empty database branch
- WHEN the baseline migration runs
- THEN all 7 tables and their indexes are created

### Requirement: Separate Idempotent Seed Step

Demo-seed data MUST be applied via a separate step from schema DDL and MUST remain idempotent using `ON CONFLICT DO NOTHING`.

#### Scenario: Seed does not duplicate on rerun

- GIVEN the seed step already ran once
- WHEN it runs again
- THEN no duplicate rows are inserted
- AND the seed step is not part of any `migrations/` DDL file

### Requirement: Retirement of ensureMigrated()

`ensureMigrated()` in `lib/db/migrate.ts` and all its call sites MUST be removed once migration parity is verified.

#### Scenario: No runtime bootstrap remains

- GIVEN the migration system is verified against production parity
- WHEN the codebase is searched for `ensureMigrated`
- THEN no references remain in `lib/db/migrate.ts` or any repository call site

### Requirement: Single System of Record for Schema Changes

Every future schema change MUST land as a new migration file in this system; ad-hoc runtime DDL MUST NOT be introduced again.

#### Scenario: Future feature adds a migration file

- GIVEN a future SDD change (e.g., roles, expenses, payroll, inventory, audit, feature flags)
- WHEN its schema requirements are implemented
- THEN a new file is added under `migrations/`
- AND no `CREATE TABLE`/`ALTER TABLE` statement is executed from application runtime code
