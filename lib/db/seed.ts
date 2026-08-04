import { sql, isDbConfigured } from "./client";
import {
  BUSINESS_ID,
  BUSINESS_ID_2,
  businessFixture,
  businessFixture2,
} from "@/lib/mock/fixtures/data";

/**
 * Idempotent seed of the demo BUSINESSES only, run BY HAND via `npm run
 * seed`. Reuses the same pooled `sql` client as runtime repos — no DDL here,
 * so pgbouncer/pooling is a non-issue. No-ops (exit 0) when no DB is
 * configured.
 *
 * Deliberately NOT part of `vercel-build` any more. It is idempotent
 * (`ON CONFLICT DO NOTHING`), so running it on every deploy was harmless but
 * pointless: it opened a write connection to the production database to do
 * nothing. It is also why a production database ends up carrying two fake
 * "Negocio Demo" businesses alongside the real ones. Run it deliberately when
 * bootstrapping a fresh database, not on every ship.
 *
 * Profiles are NO LONGER seeded here: once real Supabase Auth is wired
 * (`migrations/1700000006000_link_profiles_to_auth_users.sql`), `profiles.
 * user_id` has an FK to `auth.users(id)`, so a profile can only exist for a
 * real auth user. Users (auth user + their `profiles` membership row) are
 * provisioned by `scripts/create-user.mjs` (admin-only, no public signup) —
 * that script attaches the new user to one of these seeded businesses (or a
 * new one). The in-memory mock backend still seeds the demo profiles for
 * zero-setup local dev (`lib/mock/fixtures/*`), unchanged.
 */
async function seed(): Promise<void> {
  if (!isDbConfigured) {
    console.log("[seed] No database configured; skipping.");
    return;
  }

  await sql`
    INSERT INTO businesses (id, name, email, phone, address, currency)
    VALUES (${BUSINESS_ID}, ${businessFixture.name}, ${businessFixture.email}, ${businessFixture.phone}, ${businessFixture.address}, ${businessFixture.currency})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO businesses (id, name, email, phone, address, currency)
    VALUES (${BUSINESS_ID_2}, ${businessFixture2.name}, ${businessFixture2.email}, ${businessFixture2.phone}, ${businessFixture2.address}, ${businessFixture2.currency})
    ON CONFLICT (id) DO NOTHING
  `;

  console.log("[seed] Demo businesses seeded (profiles are provisioned via scripts/create-user.mjs).");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
