-- Up Migration
--
-- Part 3: full per-business RLS policies + close the catalog RLS gap.
--
-- Context: the app accesses data through a direct Postgres connection as the
-- `postgres` role (rolbypassrls = true, table owner), so RLS is BYPASSED for
-- the app and these policies do NOT affect any app query — authorization stays
-- enforced in the app layer (lib/services/permissions.ts + per-business_id
-- scoping). These policies are defense-in-depth for the PostgREST surface
-- (roles `anon`/`authenticated`), which today also has no table GRANTs and is
-- therefore closed; we intentionally add NO grants here (no new surface is
-- opened), we only make the policies correct for the day the Supabase client
-- SDK / anon key is ever used.
--
-- `1700000008000_enable_rls.sql` already enabled RLS on the business tables
-- (deny-all). Here we (a) enable RLS + a read-only policy on the 5 global
-- catalog tables (closes the `rls_disabled_in_public` advisor ERROR), and
-- (b) add membership-scoped policies (via `profiles` + `auth.uid()`) on the
-- business tables (closes the `rls_enabled_no_policy` advisor INFO).

-- (a) Catalog (global reference) tables: enable RLS, allow any authenticated
--     user to READ (they are shared reference data, no writes over REST).
ALTER TABLE public.invoice_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_period_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_read ON public.invoice_types FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_read ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_read ON public.payment_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_read ON public.movement_types FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_read ON public.payroll_period_types FOR SELECT TO authenticated USING (true);

-- (b) Business tables: an authenticated user may only touch rows for a
--     business they are a member of (per `profiles`). `businesses`/`profiles`
--     are scoped to the caller directly.
CREATE POLICY business_member ON public.businesses FOR ALL TO authenticated
  USING (id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY profiles_self ON public.profiles FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY customers_member ON public.customers FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY invoices_member ON public.invoices FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY payments_member ON public.payments FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY expenses_member ON public.expenses FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY employees_member ON public.employees FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY payroll_payments_member ON public.payroll_payments FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY products_member ON public.products FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY inventory_movements_member ON public.inventory_movements FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY invoice_sequences_member ON public.invoice_sequences FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY audit_log_member ON public.audit_log FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

-- invoice_items has no business_id: scope through its parent invoice.
CREATE POLICY invoice_items_member ON public.invoice_items FOR ALL TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Down Migration
DROP POLICY IF EXISTS invoice_items_member ON public.invoice_items;
DROP POLICY IF EXISTS audit_log_member ON public.audit_log;
DROP POLICY IF EXISTS invoice_sequences_member ON public.invoice_sequences;
DROP POLICY IF EXISTS inventory_movements_member ON public.inventory_movements;
DROP POLICY IF EXISTS products_member ON public.products;
DROP POLICY IF EXISTS payroll_payments_member ON public.payroll_payments;
DROP POLICY IF EXISTS employees_member ON public.employees;
DROP POLICY IF EXISTS expenses_member ON public.expenses;
DROP POLICY IF EXISTS payments_member ON public.payments;
DROP POLICY IF EXISTS invoices_member ON public.invoices;
DROP POLICY IF EXISTS customers_member ON public.customers;
DROP POLICY IF EXISTS profiles_self ON public.profiles;
DROP POLICY IF EXISTS business_member ON public.businesses;

DROP POLICY IF EXISTS catalog_read ON public.payroll_period_types;
DROP POLICY IF EXISTS catalog_read ON public.movement_types;
DROP POLICY IF EXISTS catalog_read ON public.payment_methods;
DROP POLICY IF EXISTS catalog_read ON public.expense_categories;
DROP POLICY IF EXISTS catalog_read ON public.invoice_types;

ALTER TABLE public.payroll_period_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_types DISABLE ROW LEVEL SECURITY;
