-- Up Migration

-- Catalog tables backing Wave 2's dropdowns (`lib/services/catalog-service.ts`).
-- Each is a small, business-agnostic (global) reference table: `id` +
-- unique `code` (the stable machine key existing enum/text columns already
-- use) + human-facing `label`. `invoice_types` additionally carries the
-- numbering `prefix` (see the invoice_sequences re-key below).
CREATE TABLE IF NOT EXISTS invoice_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  prefix TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS movement_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS payroll_period_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Seed. NOTE (deliberate deviation from the original proposal, which
-- suggested prefix 'FV' for `venta`): every invoice ever created by this app
-- (fixtures, existing/real data, and ~20 test files) uses the "FAC-XXXX"
-- numbering format. `venta` is backfilled below as the type for ALL existing
-- invoices, so keeping its prefix as 'FAC' preserves numbering continuity —
-- the type an existing "FAC-0001" invoice is backfilled to still matches its
-- own historical numbering convention, and no invoice format changes for any
-- caller in this wave. 'nota_credito'/'nota_debito' are brand new types with
-- no historical numbers, so their prefixes are exactly as proposed.
INSERT INTO invoice_types (code, label, prefix) VALUES
  ('venta', 'Factura de venta', 'FAC'),
  ('nota_credito', 'Nota crédito', 'NC'),
  ('nota_debito', 'Nota débito', 'ND')
ON CONFLICT (code) DO NOTHING;

INSERT INTO expense_categories (code, label) VALUES
  ('nomina', 'Nómina'),
  ('otro', 'Otro')
ON CONFLICT (code) DO NOTHING;

-- `payments.method` is free TEXT today (no enum/CHECK constraint) — the only
-- codes actually produced by the app are the fixture/demo values "cash" and
-- "transfer" (see `lib/mock/fixtures/data.ts`); seeded here verbatim as the
-- catalog's stable codes.
INSERT INTO payment_methods (code, label) VALUES
  ('cash', 'Efectivo'),
  ('transfer', 'Transferencia')
ON CONFLICT (code) DO NOTHING;

INSERT INTO movement_types (code, label) VALUES
  ('in', 'Entrada'),
  ('out', 'Salida')
ON CONFLICT (code) DO NOTHING;

INSERT INTO payroll_period_types (code, label) VALUES
  ('quincenal', 'Quincenal'),
  ('mensual', 'Mensual')
ON CONFLICT (code) DO NOTHING;

-- FK columns: add nullable, backfill, then enforce NOT NULL where the
-- source column is itself always populated. Old text/enum columns are kept
-- (not dropped) — lower risk, and every read path still works unchanged.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES expense_categories(id);
UPDATE expenses e SET category_id = c.id FROM expense_categories c WHERE c.code = e.category AND e.category_id IS NULL;
ALTER TABLE expenses ALTER COLUMN category_id SET NOT NULL;

-- DEVIATION: `payments.method_id` is left NULLABLE, not enforced NOT NULL.
-- `payments.method` itself is nullable free TEXT (a payment can be recorded
-- with no method at all) — a NULL `method` has no catalog row to backfill
-- to, so a blanket NOT NULL here would be unenforceable against existing
-- data (any payment recorded without a method) and would reject a future
-- payment with no method WITHOUT a matching CHECK on `method` itself. The FK
-- is still enforced when populated (`REFERENCES payment_methods(id)`).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method_id UUID REFERENCES payment_methods(id);
UPDATE payments p SET method_id = m.id FROM payment_methods m WHERE m.code = p.method AND p.method_id IS NULL;

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES movement_types(id);
UPDATE inventory_movements im SET type_id = mt.id FROM movement_types mt WHERE mt.code = im.type AND im.type_id IS NULL;
ALTER TABLE inventory_movements ALTER COLUMN type_id SET NOT NULL;

ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS period_type_id UUID REFERENCES payroll_period_types(id);
UPDATE payroll_payments pp SET period_type_id = pt.id FROM payroll_period_types pt WHERE pt.code = pp.period_type AND pp.period_type_id IS NULL;
ALTER TABLE payroll_payments ALTER COLUMN period_type_id SET NOT NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type_id UUID REFERENCES invoice_types(id);
-- All existing invoices predate per-type invoicing — backfill every row to `venta`.
UPDATE invoices i SET invoice_type_id = (SELECT id FROM invoice_types WHERE code = 'venta') WHERE i.invoice_type_id IS NULL;
ALTER TABLE invoices ALTER COLUMN invoice_type_id SET NOT NULL;

-- Re-key invoice_sequences from PK(business_id) to PK(business_id, invoice_type_id)
-- so numbering is independent per invoice type (e.g. FAC vs NC vs ND
-- sequences never collide/share a counter).
ALTER TABLE invoice_sequences ADD COLUMN IF NOT EXISTS invoice_type_id UUID REFERENCES invoice_types(id);
UPDATE invoice_sequences s SET invoice_type_id = (SELECT id FROM invoice_types WHERE code = 'venta') WHERE s.invoice_type_id IS NULL;
ALTER TABLE invoice_sequences ALTER COLUMN invoice_type_id SET NOT NULL;
ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_pkey;
ALTER TABLE invoice_sequences ADD PRIMARY KEY (business_id, invoice_type_id);

-- Down Migration

-- Destructive: only runs on explicit `migrate down`.
ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_pkey;
ALTER TABLE invoice_sequences ADD PRIMARY KEY (business_id);
ALTER TABLE invoice_sequences DROP COLUMN IF EXISTS invoice_type_id;

ALTER TABLE invoices DROP COLUMN IF EXISTS invoice_type_id;
ALTER TABLE payroll_payments DROP COLUMN IF EXISTS period_type_id;
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS type_id;
ALTER TABLE payments DROP COLUMN IF EXISTS method_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS category_id;

DROP TABLE IF EXISTS payroll_period_types CASCADE;
DROP TABLE IF EXISTS movement_types CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS expense_categories CASCADE;
DROP TABLE IF EXISTS invoice_types CASCADE;
