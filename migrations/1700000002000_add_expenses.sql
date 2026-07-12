-- Up Migration

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  category TEXT NOT NULL CHECK (category IN ('nomina', 'otro')),
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);

-- Down Migration

-- Destructive: only runs on explicit `migrate down`.
DROP TABLE IF EXISTS expenses CASCADE;
