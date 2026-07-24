-- Up Migration
--
-- Sales pipeline (Ventas kanban board). Each card has a user-set `stage`
-- (kanban column, moved via drag-and-drop), an optional link to a customer
-- (forward-looking CRM connection), an optional deal `amount` (COP cents),
-- and a `position` for stable ordering within a stage column. Cards ARE
-- deletable (unlike most entities). RLS enabled + membership policy, matching
-- every other business-scoped table (defense-in-depth for the PostgREST
-- surface; the app's direct `postgres` connection bypasses RLS).
CREATE TABLE IF NOT EXISTS pipeline_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  customer_id UUID REFERENCES customers(id),
  title TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('nuevo', 'interesado', 'negociacion', 'ganado', 'perdido')),
  amount INTEGER,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_cards_business ON pipeline_cards(business_id);

ALTER TABLE pipeline_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_cards_member ON public.pipeline_cards FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

-- Down Migration
DROP TABLE IF EXISTS pipeline_cards CASCADE;
