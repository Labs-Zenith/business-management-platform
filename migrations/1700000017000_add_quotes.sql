-- Up Migration
--
-- Quotes ("Cotizador"): priced proposals built from the commercial catalog
-- (`1700000016000_add_catalog_products.sql`), with their own COT-XXXX
-- numbering, a status lifecycle, a validity date, and a one-way link to the
-- invoice they eventually become.
--
-- Modeled on `invoices`/`invoice_items`/`invoice_sequences`
-- (`1700000000000_baseline.sql`) MINUS the per-type complexity that
-- `1700000010000_catalogs.sql` later added to invoices: a quote has exactly
-- one kind, so a plain `business_id`-keyed sequence table (the shape
-- `invoice_sequences` originally had) is enough and no `quote_types` catalog
-- is needed.
CREATE TABLE IF NOT EXISTS quote_sequences (
  business_id UUID PRIMARY KEY REFERENCES businesses(id),
  seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida')),
  issue_date DATE NOT NULL,
  valid_until DATE NOT NULL,
  subtotal INTEGER NOT NULL,
  total INTEGER NOT NULL,
  notes TEXT,
  -- Convert-to-invoice idempotency AND traceability in one column. A nullable
  -- FK rather than a boolean flag, so "which invoice did this become?" is
  -- answerable without a second lookup. It is NEVER cleared once set: a
  -- repeat conversion is rejected purely because this is already non-null
  -- (see `lib/db/quote-repo.ts`'s `convertToInvoice`, which re-checks it
  -- under `SELECT ... FOR UPDATE`). No ON DELETE clause, matching every other
  -- FK into `invoices`/`customers` here — neither is ever hard-deleted.
  converted_invoice_id UUID REFERENCES invoices(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, number)
);
CREATE INDEX IF NOT EXISTS idx_quotes_business ON quotes(business_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);

-- Every line is a SNAPSHOT. `description`, `quantity`, `unit_price` and
-- `line_total` are copied in at save time and are the ONLY source of truth
-- afterwards — the detail page, the PDF and the convert-to-invoice path all
-- read these four columns and never join back to the catalog for a CURRENT
-- price. That is what makes "editing a catalog price never mutates a quote
-- already sent to a customer" true by construction rather than by discipline.
--
-- `catalog_product_id`/`catalog_variant_id` are REFERENCE ONLY: they exist
-- for the "reopen in the catalog" backlink and future analytics. They are
-- `ON DELETE SET NULL`, never CASCADE — deleting a catalog listing must
-- forget the backlink, never delete or corrupt a historical quote line.
-- There is deliberately no `catalog_price_tier_id`: which rung was chosen is
-- already fully captured by the snapshotted `quantity` + `unit_price` pair.
--
-- `is_overridden` marks a line whose catalog-derived unit price the user
-- replaced by hand. A plain catalog-priced line and a free-text line (no
-- `catalog_product_id` at all) both leave it false.
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  is_overridden BOOLEAN NOT NULL DEFAULT false,
  catalog_product_id UUID REFERENCES catalog_products(id) ON DELETE SET NULL,
  catalog_variant_id UUID REFERENCES catalog_product_variants(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

ALTER TABLE quote_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_sequences_member ON public.quote_sequences FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY quotes_member ON public.quotes FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY quote_items_member ON public.quote_items FOR ALL TO authenticated
  USING (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    quote_id IN (
      SELECT id FROM public.quotes
      WHERE business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Down Migration
DROP POLICY IF EXISTS quote_items_member ON public.quote_items;
DROP POLICY IF EXISTS quotes_member ON public.quotes;
DROP POLICY IF EXISTS quote_sequences_member ON public.quote_sequences;

DROP TABLE IF EXISTS quote_items CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS quote_sequences CASCADE;
