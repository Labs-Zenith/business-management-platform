import { sql, isDbConfigured } from "./client";
import {
  BUSINESS_ID,
  DEMO_PROFILE_ID,
  DEMO_USER_ID,
  businessFixture,
  demoProfileFixture,
} from "@/lib/mock/fixtures/data";

/**
 * Idempotent demo seed (business + profile), run via `npm run seed` as a
 * separate step from schema migrations. Reuses the same pooled HTTP `sql`
 * client as runtime repos — no DDL here, so pgbouncer/pooling is a
 * non-issue. No-ops (exit 0) when no DB is configured, so it's always safe
 * to include in `vercel-build` without breaking local/mock-only setups.
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
    INSERT INTO profiles (id, user_id, business_id, full_name, email)
    VALUES (${DEMO_PROFILE_ID}, ${DEMO_USER_ID}, ${BUSINESS_ID}, ${demoProfileFixture.fullName}, ${demoProfileFixture.email})
    ON CONFLICT (id) DO NOTHING
  `;

  console.log("[seed] Demo business + profile seeded.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
