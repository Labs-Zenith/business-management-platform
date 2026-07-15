import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Admin-only user provisioning (no public signup — see the Supabase-Auth
 * migration plan). Creates a real Supabase Auth user (password hashed by
 * Supabase) AND the matching `profiles` membership row linking that user to a
 * business with a role, in one step.
 *
 * Auth users live in Supabase's `auth.users`; `profiles.user_id` has an FK to
 * `auth.users(id)`, so the profile can only be inserted AFTER the auth user
 * exists — this script guarantees that ordering.
 *
 * Run with the env loaded (Node's --env-file; needs NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY and a Postgres connection string):
 *
 *   node --env-file=.env.local scripts/create-user.mjs \
 *     --email cliente@negocio.com --password 'una-clave-fuerte' \
 *     --role admin --name "Nombre Cliente" \
 *     [--business-id <uuid> | --business-name "Mi Negocio"]
 *
 * Defaults: role=admin; business = the seeded demo business if neither
 * --business-id nor --business-name is given. Idempotent: re-running with the
 * same email reuses the existing auth user and upserts the profile.
 */

const DEMO_BUSINESS_ID = "10000000-0000-4000-8000-000000000001"; // BUSINESS_ID in lib/mock/fixtures/data.ts

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    role: { type: "string", default: "admin" },
    name: { type: "string" },
    "business-id": { type: "string" },
    "business-name": { type: "string" },
  },
});

function fail(message) {
  console.error(`[create-user] ${message}`);
  process.exit(1);
}

const email = values.email?.trim();
const password = values.password;
const role = values.role;
const fullName = values.name ?? null;

if (!email || !password) fail("Missing --email or --password.");
if (role !== "admin" && role !== "worker") fail(`--role must be 'admin' or 'worker' (got '${role}').`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment (use --env-file=.env.local).");
}
if (!connectionString) {
  fail("Missing a Postgres connection string (POSTGRES_URL / DATABASE_URL_UNPOOLED) in the environment.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Creates the auth user, or returns the existing one's id if the email is already registered. */
async function ensureAuthUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data?.user) return data.user.id;

  const alreadyExists =
    error && (error.code === "email_exists" || /already been registered|already exists/i.test(error.message ?? ""));
  if (!alreadyExists) fail(`Could not create auth user: ${error?.message ?? "unknown error"}`);

  // Find the existing user by email (paginated listing — fine for the small
  // user counts this internal tool deals with).
  for (let page = 1; page <= 20; page++) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) fail(`Could not look up existing user: ${listError.message}`);
    const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      console.log(`[create-user] Auth user already existed; reusing ${match.id}.`);
      return match.id;
    }
    if (list.users.length < 200) break;
  }
  fail("Email reported as existing but the user was not found in the listing.");
}

async function main() {
  const userId = await ensureAuthUser();
  const sql = postgres(connectionString, { prepare: false });

  try {
    // Resolve the target business.
    let businessId = values["business-id"];
    if (values["business-name"]) {
      businessId = randomUUID();
      await sql`
        INSERT INTO businesses (id, name, currency)
        VALUES (${businessId}, ${values["business-name"]}, 'COP')
      `;
      console.log(`[create-user] Created business "${values["business-name"]}" (${businessId}).`);
    } else if (!businessId) {
      businessId = DEMO_BUSINESS_ID;
    }

    const [business] = await sql`SELECT id FROM businesses WHERE id = ${businessId}`;
    if (!business) {
      fail(`Business ${businessId} does not exist. Pass --business-name to create one, or seed it first (npm run seed).`);
    }

    // Upsert the membership (one profile per user+business, per the unique
    // constraint added in migrations/1700000001000_add_roles_and_membership.sql).
    await sql`
      INSERT INTO profiles (id, user_id, business_id, full_name, email, role)
      VALUES (${randomUUID()}, ${userId}, ${businessId}, ${fullName}, ${email}, ${role})
      ON CONFLICT (user_id, business_id)
      DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, email = EXCLUDED.email, updated_at = now()
    `;

    console.log(`[create-user] OK — ${email} (${role}) provisioned for business ${businessId}.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
