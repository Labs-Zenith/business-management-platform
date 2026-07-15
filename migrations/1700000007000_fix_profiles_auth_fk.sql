-- Up Migration

-- Fix for 1700000006000: that migration guarded the FK creation on
-- `information_schema.tables`, which is privilege-filtered and does NOT list
-- Supabase's `auth.users` for the `postgres` role even though the table
-- exists and is referenceable — so the FK was silently skipped on Supabase.
--
-- This re-attempts the `profiles.user_id -> auth.users(id)` FK using
-- `to_regclass` (catalog-based existence check, not privilege-filtered), so
-- it lands on Supabase. Still guarded + idempotent so a plain non-Supabase
-- Postgres (concurrency integration test / local pg without the `auth`
-- schema) and any DB where 1700000006000 already created the FK both stay a
-- no-op.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'profiles_user_id_fkey' AND table_name = 'profiles'
     )
  THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
