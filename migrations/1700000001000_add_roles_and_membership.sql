-- Up Migration

-- `profiles_user_id_key` is Postgres's auto-assigned name for the inline
-- `user_id UUID NOT NULL UNIQUE` column constraint declared in
-- `migrations/1700000000000_baseline.sql`. Postgres names single-column
-- UNIQUE constraints `<table>_<column>_key` by default when no explicit
-- name is given, so `profiles_user_id_key` is the expected name here.
-- ASSUMPTION (unverified against a live/scratch DB at the time this
-- migration was written): if the baseline migration ever changes to name
-- this constraint explicitly, or a target DB was created differently,
-- confirm the actual name via `\d profiles` (psql) or
-- `SELECT conname FROM pg_constraint WHERE conrelid = 'profiles'::regclass`
-- before relying on this in production.
ALTER TABLE profiles DROP CONSTRAINT profiles_user_id_key;
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'worker'));
ALTER TABLE profiles ADD CONSTRAINT profiles_user_business_unique UNIQUE (user_id, business_id);
-- Intentionally unconsumed in this change: a per-business feature-flag
-- mechanism for future features (e.g. Nomina/Inventario) to gate on; no
-- runtime reader exists yet (see proposal.md "Out of Scope"). Not dead code
-- — reserved column for the next feature that needs it.
ALTER TABLE businesses ADD COLUMN enabled_features TEXT[] NOT NULL DEFAULT '{}';

-- Down Migration

-- Reverse order of Up. Restoring the global `UNIQUE(user_id)` constraint
-- fails if any user holds 2+ memberships (dev-only rollback expectation —
-- drop the 2nd seeded profile/membership first).
ALTER TABLE businesses DROP COLUMN enabled_features;
ALTER TABLE profiles DROP CONSTRAINT profiles_user_business_unique;
ALTER TABLE profiles DROP COLUMN role;
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
