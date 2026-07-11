import { spawnSync } from "node:child_process";

/**
 * Thin wrapper around node-pg-migrate: resolves the NON-pooled Postgres
 * connection string (node-pg-migrate uses `pg`/TCP, which pgbouncer's
 * pooled connections don't support for DDL), sets it as `DATABASE_URL`
 * (node-pg-migrate's default env var), then spawns the CLI with the
 * `migrations/` directory and any extra args (e.g. `up`, `down`, `redo`)
 * forwarded through.
 *
 * Runs only from the `migrate`/`vercel-build` npm scripts — never at
 * runtime, so local dev/build without a DB configured is unaffected.
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
