# Design: node-pg-migrate build-time migration runner

## Technical Approach

Replace runtime `ensureMigrated()` with `node-pg-migrate` running at Vercel build time
against the NON-pooled Neon string over `pg`/TCP. Runtime data access is untouched
(pooled `neon()` HTTP). A single baseline migration reproduces the current 7-table
schema verbatim (all `IF NOT EXISTS`, safe no-op on prod). The demo seed leaves DDL and
becomes a separate idempotent `tsx` script reusing the existing HTTP `sql` client.

## Architecture Decisions

### Decision: Raw SQL migration file vs. JS `pgm.sql()`
**Choice**: Raw `.sql` file with `-- Up Migration` / `-- Down Migration` markers.
**Alternatives**: JS migration calling `pgm.sql(\`...\`)`.
**Rationale**: Baseline is pure DDL copied verbatim from `migrate.ts`; a `.sql` file is
the most transparent, diff-friendly form and matches node-pg-migrate's SQL convention.
No programmatic logic is needed. (Verify the marker delimiter against the installed v7
docs during apply — a wrong marker silently drops the down section.)

### Decision: Connection resolution — wrapper script vs. `--database-url-var`
**Choice**: Thin `scripts/db-migrate.mjs` wrapper that resolves a fallback chain
(`DATABASE_URL_UNPOOLED` → `POSTGRES_URL_NON_POOLING` → `DATABASE_URL` → `POSTGRES_URL`),
sets `DATABASE_URL`, then spawns `node-pg-migrate` (which reads `DATABASE_URL` by default).
**Alternatives**: Single `-d/--database-url-var <VAR>` flag; hardcoding one var.
**Rationale**: `--database-url-var` accepts exactly ONE env var name and cannot express
the proposal's required fallback (Neon integration versions expose different names). The
wrapper makes the "which non-pooled var" logic explicit and fails loudly with a clear
message if none is set, directly mitigating the "wrong flag silently breaks build" risk.

### Decision: Seed driver — reuse HTTP `sql` vs. new `pg` connection
**Choice**: Reuse `sql`/`isDbConfigured` from `lib/db/client.ts` in `lib/db/seed.ts`,
run via `tsx`.
**Alternatives**: Open a second `pg` (TCP) connection for the seed.
**Rationale**: The seed is two idempotent `ON CONFLICT DO NOTHING` INSERTs — no DDL, so
pgbouncer is irrelevant and the pooled HTTP path is fine. Reusing `client.ts` keeps ONE
connection config and adds no runtime `pg` coupling. `isDbConfigured` false → no-op
exit 0, so local build without a DB never fails.

## Data Flow

    Vercel build:  db-migrate.mjs ─(DATABASE_URL=non-pooled)→ node-pg-migrate up
                        │                                          │ pg/TCP
                        ▼                                          ▼
                   migrations/*.sql ──────────────→ Neon (pgmigrations tracked)
                   seed.ts ─(POSTGRES_URL pooled, neon HTTP)→ businesses+profiles
                        │
                        ▼
                   next build   (runtime repos unchanged: neon() HTTP, no pg)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/1700000000000_baseline.sql` | Create | Baseline: 7 tables + indexes, verbatim from `migrate.ts`, all `IF NOT EXISTS` |
| `scripts/db-migrate.mjs` | Create | Resolves non-pooled URL → `DATABASE_URL`, spawns `node-pg-migrate` |
| `lib/db/seed.ts` | Create | Idempotent demo business+profile seed via `client.ts` `sql` |
| `lib/db/migrate.ts` | Delete | DDL → baseline; seed → seed.ts; `ensureMigrated` retired |
| `lib/db/business-repo.ts` | Modify | Remove import (L3) + 1 call (L31) |
| `lib/db/customer-repo.ts` | Modify | Remove import (L15) + 4 calls (L143,172,205,215) |
| `lib/db/invoice-repo.ts` | Modify | Remove import (L15) + 3 calls (L162,178,186) |
| `lib/db/payment-repo.ts` | Modify | Remove import (L4) + 3 calls (L53,61,75) |
| `package.json` | Modify | devDeps + `migrate`/`migrate:create`/`seed`/`vercel-build` scripts |
| `.env.example` | Modify | Document non-pooled vars |

`grep` confirms `./migrate` is imported ONLY by those 4 repos — full deletion is safe.

## Interfaces / Contracts

`migrations/1700000000000_baseline.sql`:
```sql
-- Up Migration
CREATE TABLE IF NOT EXISTS businesses ( id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, currency TEXT NOT NULL DEFAULT 'COP', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE TABLE IF NOT EXISTS profiles ( id UUID PRIMARY KEY, user_id UUID NOT NULL UNIQUE, business_id UUID NOT NULL REFERENCES businesses(id), full_name TEXT, email TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE TABLE IF NOT EXISTS customers ( id UUID PRIMARY KEY, business_id UUID NOT NULL REFERENCES businesses(id), name TEXT NOT NULL, document_number TEXT, email TEXT, phone TEXT, address TEXT, notes TEXT, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE TABLE IF NOT EXISTS invoice_sequences ( business_id UUID PRIMARY KEY, seq INTEGER NOT NULL DEFAULT 0 );
CREATE TABLE IF NOT EXISTS invoices ( id UUID PRIMARY KEY, business_id UUID NOT NULL REFERENCES businesses(id), customer_id UUID NOT NULL REFERENCES customers(id), number TEXT NOT NULL, issue_date DATE NOT NULL, due_date DATE, subtotal INTEGER NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(business_id, number) );
CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE TABLE IF NOT EXISTS invoice_items ( id UUID PRIMARY KEY, invoice_id UUID NOT NULL REFERENCES invoices(id), description TEXT NOT NULL, quantity NUMERIC NOT NULL, unit_price INTEGER NOT NULL, line_total INTEGER NOT NULL );
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE TABLE IF NOT EXISTS payments ( id UUID PRIMARY KEY, business_id UUID NOT NULL REFERENCES businesses(id), invoice_id UUID NOT NULL REFERENCES invoices(id), customer_id UUID NOT NULL REFERENCES customers(id), payment_date DATE NOT NULL, amount INTEGER NOT NULL, method TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id);

-- Down Migration
-- Destructive: only runs on explicit `migrate down`. Reverse FK order.
DROP TABLE IF EXISTS payments, invoice_items, invoices, invoice_sequences, customers, profiles, businesses CASCADE;
```

`scripts/db-migrate.mjs`:
```js
import { spawnSync } from "node:child_process";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
  || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error("[migrate] No non-pooled Postgres URL. Set DATABASE_URL_UNPOOLED (preferred) or POSTGRES_URL_NON_POOLING."); process.exit(1); }
const r = spawnSync("node-pg-migrate", ["-m", "migrations", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status ?? 1);
```
(npm injects `node_modules/.bin` into PATH so the spawned `node-pg-migrate` resolves.)

`lib/db/seed.ts` (relative fixture import to avoid alias resolver in `tsx`):
```ts
import { sql, isDbConfigured } from "./client";
import { BUSINESS_ID, DEMO_PROFILE_ID, DEMO_USER_ID, businessFixture, demoProfileFixture } from "../mock/fixtures/data";
async function seed() {
  if (!isDbConfigured) { console.log("[seed] No DB configured; skipping."); return; }
  await sql`INSERT INTO businesses (id, name, email, phone, address, currency) VALUES (${BUSINESS_ID}, ${businessFixture.name}, ${businessFixture.email}, ${businessFixture.phone}, ${businessFixture.address}, ${businessFixture.currency}) ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO profiles (id, user_id, business_id, full_name, email) VALUES (${DEMO_PROFILE_ID}, ${DEMO_USER_ID}, ${BUSINESS_ID}, ${demoProfileFixture.fullName}, ${demoProfileFixture.email}) ON CONFLICT (id) DO NOTHING`;
}
seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

`package.json` — add devDeps `node-pg-migrate ^7.9.0`, `pg ^8.13.0`, `@types/pg ^8.11.0`,
`tsx ^4.19.0`; scripts:
```json
"build": "next build",
"migrate": "node scripts/db-migrate.mjs up",
"migrate:create": "node-pg-migrate create -m migrations -j sql",
"seed": "tsx lib/db/seed.ts",
"vercel-build": "npm run migrate && npm run seed && next build"
```
`build` stays plain `next build` (never needs a DB locally). Vercel auto-prefers
`vercel-build`, so migrate/seed run only in the build context.

`.env.example` — add below `POSTGRES_URL`:
```
# Non-pooled (direct) connection used ONLY by build-time migrations (node-pg-migrate
# over pg/TCP; avoids pgbouncer DDL issues). Runtime uses the pooled POSTGRES_URL above.
DATABASE_URL_UNPOOLED=
POSTGRES_URL_NON_POOLING=
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Static | Baseline idempotency | Read `.sql`: every CREATE has `IF NOT EXISTS` |
| Static | No stale refs | `grep ensureMigrated` returns zero after edits; `tsc --noEmit`, `eslint` |
| Unit | Mock path intact | `vitest run` (mock repos never touched `migrate`) |
| Integration | Real migration | `vercel env pull` then `npm run migrate` against a Neon branch; assert `pgmigrations` row + tables; re-run is no-op |
| Build | No `pg` in bundle | After `next build`, grep `.next` server trace for `node-pg-migrate`/`pg` |

**Testable in this sandbox**: static idempotency read, `grep`, `typecheck`, `lint`,
`vitest` (mock path). **Requires creds/deploy**: real Neon migration run, serverless
bundle trace, actual Vercel `vercel-build`.

## Migration / Rollout

Single PR. Baseline `IF NOT EXISTS` → no-op on the existing prod DB (7 tables present);
node-pg-migrate records the baseline in `pgmigrations` going forward. Rollback = revert
PR (restore `ensureMigrated` + call sites, drop devDeps/scripts/`migrations`); no
destructive schema change, so no data-loss risk. `pgmigrations` may be left inert.

## Open Questions

- [ ] Confirm the SQL delimiter node-pg-migrate v7 expects (`-- Up Migration` /
  `-- Down Migration`) against installed docs before apply — a wrong marker silently
  drops the down section.
- [ ] Preview deploys without an attached Neon branch will fail at `migrate` (loud, by
  design per proposal). Confirm all preview envs get a DB branch, or gate migrate.
