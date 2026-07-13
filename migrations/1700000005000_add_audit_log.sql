-- Up Migration

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(business_id, entity_type, entity_id);

-- Down Migration

-- Destructive: only runs on explicit `migrate down`.
DROP TABLE IF EXISTS audit_log CASCADE;
