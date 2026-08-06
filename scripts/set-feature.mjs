import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Ops tool to toggle a per-business feature flag (the `business_features`
 * table, `migrations/1700000015000_add_business_features.sql` — PK
 * `(business_id, feature)`, deny-by-default) without hand-written SQL. See
 * `lib/services/features.ts` for the runtime reader and
 * `lib/services/ports.ts`'s `Feature` union for the full set of valid slugs.
 *
 * Resolves the target business either directly (`--business-id`) or via a
 * `--username` (the same `<name>@zenith.app` mapping `create-user.mjs` uses
 * when provisioning, per `lib/auth/username.ts`): looks the username up in
 * Supabase `auth.users`, then joins `profiles` -> `businesses`. A user can
 * hold memberships in more than one business (`profiles_user_business_unique`
 * is `UNIQUE(user_id, business_id)`, not a global unique on `user_id` — see
 * `migrations/1700000001000_add_roles_and_membership.sql`), so an ambiguous
 * username is a hard error: this script never guesses which business the
 * operator meant.
 *
 * Run with the env loaded (Node's --env-file):
 *
 *   node --env-file=.env.local scripts/set-feature.mjs \
 *     --username demozenith --feature catalog [--off]
 *
 *   node --env-file=.env.local scripts/set-feature.mjs \
 *     --business-id <uuid> --feature quotes
 *
 * Default action enables the feature; pass --off to disable it. Idempotent:
 * re-running upserts the same `(business_id, feature)` row.
 */

const VALID_FEATURES = ["pipeline", "catalog"];

const USAGE = `Usage:
  node scripts/set-feature.mjs --username <name> --feature <${VALID_FEATURES.join("|")}> [--off]
  node scripts/set-feature.mjs --business-id <uuid> --feature <${VALID_FEATURES.join("|")}> [--off]

Options:
  --username <name>      Resolve the business via auth.users -> profiles -> businesses.
  --business-id <uuid>   Target business directly. Exactly one of --username/--business-id is required.
  --feature <slug>       One of: ${VALID_FEATURES.join(", ")}.
  --off                  Disable the feature (default action enables it).
  --help                 Show this help and exit.
`;

function fail(message) {
  console.error(`[set-feature] ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    "business-id": { type: "string" },
    feature: { type: "string" },
    off: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

if (!values.username && !values["business-id"]) {
  fail(`Missing --username or --business-id (exactly one is required).\n\n${USAGE}`);
}
if (values.username && values["business-id"]) {
  fail(`Pass either --username or --business-id, not both.\n\n${USAGE}`);
}
if (!values.feature) {
  fail(`Missing --feature.\n\n${USAGE}`);
}
if (!VALID_FEATURES.includes(values.feature)) {
  fail(`--feature must be one of: ${VALID_FEATURES.join(", ")} (got '${values.feature}').`);
}

const feature = values.feature;
const enabled = !values.off;

// Internal login domain — MUST match `lib/auth/username.ts`'s
// INTERNAL_EMAIL_DOMAIN, same convention as `create-user.mjs`.
const INTERNAL_EMAIL_DOMAIN = "zenith.app";

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  fail("Missing a Postgres connection string (POSTGRES_URL / DATABASE_URL_UNPOOLED) in the environment.");
}

// The Supabase Auth admin client is only needed to resolve --username -> a
// user id; --business-id skips it entirely, so those env vars are validated
// lazily rather than up front (unlike create-user.mjs, which always needs
// Auth to create a user).
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment (use --env-file=.env.local).");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves a --username to its Supabase auth.users id, or fails if none matches. */
async function resolveUserId(username) {
  const admin = getSupabaseAdmin();
  const trimmed = username.trim();
  const email = trimmed.includes("@") ? trimmed : `${trimmed}@${INTERNAL_EMAIL_DOMAIN}`;

  for (let page = 1; page <= 20; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not look up user "${username}": ${error.message}`);
    const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (list.users.length < 200) break;
  }
  fail(`No auth user found for username "${username}" (looked up as ${email}).`);
}

async function main() {
  const sql = postgres(connectionString, { prepare: false });

  try {
    let businessId = values["business-id"];

    if (values.username) {
      const userId = await resolveUserId(values.username);
      const memberships = await sql`
        SELECT b.id, b.name
        FROM profiles p
        JOIN businesses b ON b.id = p.business_id
        WHERE p.user_id = ${userId}
        ORDER BY b.name
      `;

      if (memberships.length === 0) {
        fail(`Username "${values.username}" has no business memberships (no profiles row for that user).`);
      }
      if (memberships.length > 1) {
        console.error(
          `[set-feature] Username "${values.username}" belongs to ${memberships.length} businesses — re-run with --business-id instead of guessing:`
        );
        for (const m of memberships) {
          console.error(`  - ${m.name} (${m.id})`);
        }
        process.exit(1);
      }

      businessId = memberships[0].id;
    }

    const [business] = await sql`SELECT id, name FROM businesses WHERE id = ${businessId}`;
    if (!business) {
      fail(`Business ${businessId} does not exist.`);
    }

    await sql`
      INSERT INTO business_features (business_id, feature, enabled)
      VALUES (${businessId}, ${feature}, ${enabled})
      ON CONFLICT (business_id, feature)
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
    `;

    console.log(
      `[set-feature] OK — feature "${feature}" ${enabled ? "ENABLED" : "DISABLED"} for business "${business.name}" (${business.id}).`
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
