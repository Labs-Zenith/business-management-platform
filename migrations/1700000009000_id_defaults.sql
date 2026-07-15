-- Up Migration

-- Every INSERT in `lib/db/*` already supplies `gen_random_uuid()` explicitly,
-- so this migration is defense-in-depth (any future/manual INSERT that omits
-- `id` still gets a valid UUID instead of a NOT NULL violation), not a
-- behavior change. `ALTER COLUMN ... SET DEFAULT` is idempotent — safe to
-- re-run.
ALTER TABLE businesses ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE customers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE invoices ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE invoice_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE payments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE expenses ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE employees ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE payroll_payments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE inventory_movements ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Down Migration

ALTER TABLE businesses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE invoices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE invoice_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE expenses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE employees ALTER COLUMN id DROP DEFAULT;
ALTER TABLE payroll_payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE products ALTER COLUMN id DROP DEFAULT;
ALTER TABLE inventory_movements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE audit_log ALTER COLUMN id DROP DEFAULT;
