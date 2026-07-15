-- Up Migration

-- Enable Row Level Security on every public table.
--
-- This app does NOT use Supabase's auto-exposed PostgREST data API: all data
-- access goes through a direct Postgres connection (`lib/db/*` via
-- postgres.js) as the `postgres` role, which BYPASSES RLS (rolbypassrls +
-- table owner). Authorization is enforced in the application layer
-- (`lib/services/permissions.ts`), not via RLS policies.
--
-- With RLS DISABLED, the public `anon` key (shipped to the browser) could be
-- used against the PostgREST endpoint to read/write every row directly,
-- bypassing the app. Enabling RLS with NO policies denies the `anon` /
-- `authenticated` roles (the REST API) by default while leaving the app's
-- direct `postgres` connection unaffected — closing that exposure without
-- adding any policy surface.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op if already enabled.
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgmigrations ENABLE ROW LEVEL SECURITY;
