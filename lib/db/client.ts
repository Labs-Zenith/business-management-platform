import postgres from "postgres";

/**
 * Real Postgres data backend (postgres.js, TCP protocol) — replaces the
 * ephemeral in-memory/cookie-based mock store for deployed environments.
 * Vercel injects `POSTGRES_URL` automatically once a database is attached to
 * the project; `DATABASE_URL` is accepted too for local/manual setups
 * (`vercel env pull`).
 *
 * `lib/services/repositories.ts` picks these repos over `lib/mock/*` only
 * when `isDbConfigured` is true, so local dev without a database keeps
 * working exactly as before (zero-setup mock).
 */
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

export const isDbConfigured = Boolean(connectionString);

// `prepare: false` is REQUIRED: Supabase's connection pooler (pgbouncer, in
// transaction mode) does not support prepared statements, which postgres.js
// otherwise uses by default for every tagged-template query.
export const sql = connectionString
  ? postgres(connectionString, { prepare: false })
  : (null as unknown as ReturnType<typeof postgres>);

/**
 * Shared wrapper for postgres.js's INTERACTIVE `sql.begin(async (tx) => {...})`
 * transaction.
 *
 * ---------------------------------------------------------------------------
 * CANONICAL NOTE — the two-statement `FOR UPDATE` guard pattern (read this
 * before adding a 5th guarded writer; the per-repo doc comments only carry
 * their OWN file-specific details and point here for the shared reasoning):
 * ---------------------------------------------------------------------------
 *
 * Several repos (`inventory-repo.ts`, `payment-repo.ts`, `invoice-repo.ts`)
 * must enforce a check-then-write invariant against a concurrent writer on the
 * SAME row (stock floor-at-zero, payment overpay guard, invoice edit-lock).
 * The correct, empirically-verified shape is TWO statements inside ONE
 * transaction (now `sql.begin(async (tx) => {...})`, run as sequential
 * `await`s in that callback):
 *
 *   Statement 1: `SELECT … FOR UPDATE` — acquires and HOLDS the row lock for
 *                the whole transaction, reading NOTHING it will later guard on.
 *   Statement 2+: the guarded mutation(s), run AFTER statement 1 holds the
 *                lock. Under READ COMMITTED each later statement takes its OWN
 *                fresh start-of-statement snapshot.
 *
 * WHY NOT a single statement with `FOR UPDATE` inline (the intuitive fix): a
 * correlated subquery (or `NOT EXISTS`) evaluated in the SAME statement that
 * acquires the lock is NOT re-evaluated with a fresh snapshot when that
 * statement unblocks. Postgres's EvalPlanQual only re-checks the LOCKED row's
 * own columns against the newest committed version — a `SUM`/`NOT EXISTS` over
 * a DIFFERENT table (movements, payments) keeps the stale value it computed
 * before the lock wait. Two concurrent writers therefore both pass a stale
 * guard and both commit, violating the invariant. This was reproduced against
 * a real Postgres 16 container for BOTH the inventory floor guard and the
 * invoice edit-vs-payment race; see each repo's file comment for its run
 * counts and `openspec/changes/audit-log/design.md`'s "Open Questions" for the
 * consolidated decision record.
 *
 * WHY THE SPLIT WORKS: statement 1 blocks a concurrent writer's OWN statement 1
 * on the row lock until this transaction commits; only then does the other
 * side's statement 2 run and take a snapshot that already reflects what this
 * transaction committed. The `begin` callback runs its statements as
 * sequential `await`s in program order, so statement 2 always executes AFTER
 * statement 1 has already acquired and is holding the lock within the same
 * transaction.
 */
export function runTransaction<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(fn) as Promise<T>;
}
