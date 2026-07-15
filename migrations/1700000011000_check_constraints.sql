-- Up Migration

-- Non-negativity guards on money/quantity columns that had none before.
-- Guarded with a `pg_constraint` existence check (via `DO $$ ... $$`) instead
-- of a bare `ADD CONSTRAINT`, so re-running this migration (or applying it
-- after a manual/partial run) never fails with a duplicate-constraint error.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_subtotal_nonneg') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_subtotal_nonneg CHECK (subtotal >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_total_nonneg') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_total_nonneg CHECK (total >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_nonneg') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_nonneg CHECK (amount >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_quantity_nonneg') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_quantity_nonneg CHECK (quantity >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_unit_price_nonneg') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_unit_price_nonneg CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_line_total_nonneg') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_line_total_nonneg CHECK (line_total >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_base_salary_nonneg') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_base_salary_nonneg CHECK (base_salary >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_unit_cost_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT products_unit_cost_nonneg CHECK (unit_cost >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_payments_amount_nonneg') THEN
    ALTER TABLE payroll_payments ADD CONSTRAINT payroll_payments_amount_nonneg CHECK (amount >= 0);
  END IF;
END $$;

-- Down Migration

-- Destructive: only runs on explicit `migrate down`.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_subtotal_nonneg;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_total_nonneg;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_nonneg;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_quantity_nonneg;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_unit_price_nonneg;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_line_total_nonneg;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_base_salary_nonneg;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_cost_nonneg;
ALTER TABLE payroll_payments DROP CONSTRAINT IF EXISTS payroll_payments_amount_nonneg;
