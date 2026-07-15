-- Up Migration

-- Fase 2 of the Supabase migration (see `docs/db-driver-migration.md`):
-- links `profiles.user_id` to Supabase's own `auth.users(id)` so a deleted
-- Supabase auth user cascades to delete their `profiles` row(s) too.
--
-- Guarded and idempotent so this migration is safe to run against a plain,
-- non-Supabase Postgres (e.g. the concurrency integration test / local dev
-- pg without the Supabase `auth` schema) — `npm run migrate` must not break
-- there. The FK is only added when BOTH: (1) an `auth.users` table actually
-- exists, and (2) the constraint doesn't already exist (re-run safety).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='profiles_user_id_fkey' AND table_name='profiles')
  THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Down Migration

-- Destructive: only runs on explicit `migrate down`. Guarded the same way —
-- dropping a constraint that was never added (non-Supabase Postgres) is a
-- silent no-op via `IF EXISTS`, not an error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='profiles_user_id_fkey' AND table_name='profiles')
  THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_user_id_fkey;
  END IF;
END $$;
