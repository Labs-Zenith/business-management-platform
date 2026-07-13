import { neon } from "@neondatabase/serverless";

/**
 * Real Postgres (Neon, via Vercel Storage integration) data backend —
 * replaces the ephemeral in-memory/cookie-based mock store for deployed
 * environments. Vercel injects `POSTGRES_URL` automatically once a Neon
 * database is attached to the project; `DATABASE_URL` is accepted too for
 * local/manual setups (`vercel env pull`).
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

export const sql = connectionString ? neon(connectionString) : (null as unknown as ReturnType<typeof neon>);

/**
 * Shared wrapper for Neon's non-interactive `sql.transaction([...])`.
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
 * `sql.transaction([...])`:
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
 * transaction committed. `sql.transaction` is non-interactive (all queries
 * submitted upfront, no query's text can depend on another's returned data),
 * which is fine because statement 2's SQL depends only on RUNNING AFTER
 * statement 1 within the same lock-holding transaction, not on its result.
 *
 * The cast: each tagged-template call infers a slightly different
 * `NeonQueryPromise` result shape that the driver's homogeneous-array
 * `transaction()` signature can't unify — this is a purely-TS ergonomics cast,
 * not a behavior change; the queries still run as one real transaction.
 */
export function runTransaction<T extends unknown[]>(queries: unknown[]): Promise<T> {
  return (sql.transaction as (q: unknown[]) => Promise<unknown[]>)(queries) as Promise<T>;
}
