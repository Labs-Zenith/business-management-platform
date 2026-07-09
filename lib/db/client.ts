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
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

export const isDbConfigured = Boolean(connectionString);

export const sql = connectionString ? neon(connectionString) : (null as unknown as ReturnType<typeof neon>);
