import { spawnSync } from "node:child_process";

/**
 * Thin wrapper around node-pg-migrate: resolves the NON-pooled Postgres
 * connection string (node-pg-migrate uses `pg`/TCP, which pgbouncer's
 * pooled connections don't support for DDL), sets it as `DATABASE_URL`
 * (node-pg-migrate's default env var), then spawns the CLI with the
 * `migrations/` directory and any extra args (e.g. `up`, `down`, `redo`)
 * forwarded through.
 *
 * Runs ONLY from the `migrate` npm script, by hand — never at runtime, and
 * deliberately NOT from `vercel-build` any more: a deploy that silently
 * mutates the shared database is not something anyone gets to review, and a
 * failed migration would take the whole build down with it. Applying a
 * migration is now an explicit, supervised step before (or after) the deploy.
 *
 * The trade-off is real: nothing forces a pending migration to be applied, so
 * merging code that expects a new column/table without running this first
 * leaves production running against an older schema. Run it as part of
 * shipping any change that adds a file under `migrations/`.
 *
 * NOTE on ordering: node-pg-migrate compares the on-disk migration list
 * against the `pgmigrations` ledger POSITION BY POSITION, so a branch that
 * lacks a migration already applied from another branch will fail with "Not
 * run migration X is preceding already run migration Y" as soon as it adds
 * one of its own. When that happens the fix is to land the other branch, not
 * to renumber — or, as a supervised one-off, to pass `--no-check-order`.
 */
const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!url) {
  console.error(
    "[migrate] No non-pooled Postgres URL configured. Set DATABASE_URL_UNPOOLED (preferred) or POSTGRES_URL_NON_POOLING in the environment before running migrations."
  );
  process.exit(1);
}

const result = spawnSync("node-pg-migrate", ["-m", "migrations", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
