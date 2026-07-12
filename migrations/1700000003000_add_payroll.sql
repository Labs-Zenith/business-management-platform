-- Up Migration

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  base_salary INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_business ON employees(business_id);

CREATE TABLE IF NOT EXISTS payroll_payments (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  amount INTEGER NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('quincenal', 'mensual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_business ON payroll_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_employee ON payroll_payments(employee_id);

-- Down Migration

-- Destructive: only runs on explicit `migrate down`.
DROP TABLE IF EXISTS payroll_payments CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
