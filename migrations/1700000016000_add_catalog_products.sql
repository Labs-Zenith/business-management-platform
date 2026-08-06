-- Up Migration
--
-- Commercial product catalog ("Catálogo") — the price book of what a business
-- SELLS. Deliberately distinct from two neighbours it is easy to confuse with:
--   * `products` (`1700000004000_add_inventory.sql`) is INVENTORY — a
--     stock-tracked SKU with quantities and movements. A catalog product has
--     no stock at all; it is a sellable listing with a pricing rule.
--   * the global reference lookups in `lib/db/catalog-repo.ts`
--     (`invoice_types`, `expense_categories`, …) are SHARED, not
--     business-scoped, and unrelated to pricing. The file names for THIS
--     module are `product-catalog-*` precisely to keep the two apart.
--
-- `pricing_mode` picks which of five mutually exclusive pricing shapes a
-- product uses. The five exist because a real print-shop catalog
-- (`docs/printing/catalogo/printing.md`) quotes in three incompatible ways at
-- once, plus a made-to-measure case the printed catalog does not cover, plus
-- the trivial flat price every non-printing business needs:
--   fixed   -> one unit price on the PRODUCT row, free quantity.
--   variant -> N named variants (a measurement/material), each with its OWN
--              `unit_price`, free quantity. "Aviso en acrílico 150x55 cm".
--   package -> N named variants, each a CLOSED package: a FIXED
--              `package_quantity` and a FIXED `package_total_price`. The
--              buyer picks how many PACKAGES, never the count inside one —
--              "stickers 3x3 cm vienen de a 750 por $60.000".
--   tiered  -> N named variants, each with a ladder of `catalog_price_tiers`
--              rungs (an exact quantity + a per-unit OR flat price).
--              "agendas: 12 a $20.000 c/u, 24 a $16.000 c/u, …".
--   area    -> made to measure: `area_base_price` + `area_rate_per_m2` *
--              (width_cm * height_cm / 10000), with an optional per-unit
--              floor. No variants.
--
-- MINIMUM ORDER is a QUANTITY rule, never a price rule — you cannot buy one
-- sticker out of a 750-unit package. `package` and `tiered` enforce that by
-- construction (there is no fraction of a package, and no rung below the
-- lowest one), so the minimum for those two is DERIVED, never stored. Only
-- the free-quantity modes (`fixed`/`variant`/`area`) need the explicit
-- `min_order_quantity` column below.
--
-- WHY `area_rate_per_m2` (cents per SQUARE METER) rather than per cm²: money
-- is integer minor units end to end in this codebase (`lib/money.ts`), and a
-- realistic per-cm² print rate is sub-cent (~$80.000 COP/m² is 0.8
-- cents/cm²). A per-cm² column would force either a fractional NUMERIC rate
-- (breaking the convention) or silent precision loss. Per m² stays an exact
-- INTEGER and `lib/pricing/quote-line.ts` does the /10000 division at a
-- single, documented rounding site.
--
-- NULLABLE-SOUP AVOIDANCE: instead of one flat row carrying every mode's
-- columns with nothing enforcing which apply, `catalog_products_mode_fields_chk`
-- pins exactly which columns may be non-null per `pricing_mode`. The
-- cross-TABLE half of the invariant (a `tiered` variant must have >= 1 tier
-- row; a `package` product's variants must use the package columns) cannot be
-- a CHECK — Postgres CHECKs may not reference sibling tables — so it lives in
-- `lib/services/product-catalog-service.ts` and `lib/schemas/catalog-product.ts`,
-- matching this schema's standing convention of no triggers anywhere in
-- `migrations/`.
CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  -- Free-text grouping for display only (e.g. "Avisos", "Stickers", matching
  -- the printing catalog's own sections). No FK/enum: this is per-business
  -- commercial taxonomy, not shared reference data.
  category TEXT,
  description TEXT,
  pricing_mode TEXT NOT NULL CHECK (pricing_mode IN ('fixed', 'variant', 'package', 'tiered', 'area')),
  -- Smallest quantity that may be ordered, for the FREE-QUANTITY modes only
  -- (`fixed`/`variant`/`area`). Left at 1 and unused for `package`/`tiered`,
  -- whose minimum is implied by the package size / lowest rung.
  min_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_order_quantity > 0),
  -- `fixed` mode only. Integer COP cents (see `lib/money.ts`).
  fixed_unit_price INTEGER,
  -- `area` mode only. Integer COP cents.
  area_base_price INTEGER,
  -- `area` mode only. Integer COP cents PER SQUARE METER — see header note.
  area_rate_per_m2 INTEGER,
  -- `area` mode only, OPTIONAL. Integer COP cents; a PER-UNIT floor applied
  -- after the area maths and before quantity multiplies. Secondary to
  -- `min_order_quantity`, which is the real "you can't buy just one" guard.
  area_min_price INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Natural, idempotent upsert key for `scripts/seed-printing-catalog.ts`
  -- (`ON CONFLICT (business_id, name) DO UPDATE`), and it stops two
  -- accidental duplicate listings of the same name in one business.
  UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_catalog_products_business ON catalog_products(business_id);

ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_mode_fields_chk CHECK (
  (pricing_mode = 'fixed'
    AND fixed_unit_price IS NOT NULL
    AND area_base_price IS NULL AND area_rate_per_m2 IS NULL AND area_min_price IS NULL)
  OR (pricing_mode = 'area'
    AND fixed_unit_price IS NULL
    AND area_base_price IS NOT NULL AND area_rate_per_m2 IS NOT NULL)
  OR (pricing_mode IN ('variant', 'package', 'tiered')
    AND fixed_unit_price IS NULL
    AND area_base_price IS NULL AND area_rate_per_m2 IS NULL AND area_min_price IS NULL)
);

-- Named sub-listings under a product — the measurement/material the customer
-- actually picks. Exactly one of three pricing shapes is populated per row:
--   `unit_price` set, package columns NULL      -> a `variant`-mode variant.
--   `package_quantity` + `package_total_price`  -> a `package`-mode variant
--     (units inside ONE package + that package's total price).
--   all three NULL                              -> a `tiered`-mode variant,
--     whose prices live entirely in `catalog_price_tiers` below.
-- This is how a package's fixed quantity and a tier ladder coexist in one
-- schema without ambiguous nulls: a variant is EITHER a package OR a ladder
-- holder, never both, enforced by the CHECK below; the parent product's
-- `pricing_mode` (checked in the service layer, since it spans tables)
-- decides which branch every variant under it must take.
CREATE TABLE IF NOT EXISTS catalog_product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER,
  package_quantity INTEGER,
  package_total_price INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_product_variants_product ON catalog_product_variants(product_id);

ALTER TABLE catalog_product_variants ADD CONSTRAINT catalog_product_variants_fields_chk CHECK (
  (unit_price IS NOT NULL AND package_quantity IS NULL AND package_total_price IS NULL)
  OR (unit_price IS NULL AND package_quantity IS NOT NULL AND package_total_price IS NOT NULL)
  OR (unit_price IS NULL AND package_quantity IS NULL AND package_total_price IS NULL)
);
ALTER TABLE catalog_product_variants ADD CONSTRAINT catalog_product_variants_package_positive_chk
  CHECK (package_quantity IS NULL OR package_quantity > 0);

-- The quantity ladder of a `tiered`-mode variant. `quantity` is the EXACT
-- rung offered (not a lower bound for a range) — the printed catalog sells
-- 12, 24, 36 or 50 agendas, nothing in between. The lowest `quantity` across
-- a variant's rungs IS its minimum order, derived with MIN() at read time
-- (`CatalogProductVariantWithTiers.minOrderQuantity`) rather than duplicated
-- into a column that could drift away from the ladder it describes.
--
-- Exactly one of `unit_price` (total = unit_price * quantity, the catalog's
-- "Precio c/u" tables) or `flat_total_price` (a lump sum for the whole rung
-- with no implied per-unit figure, the catalog's single-"Precio" tables such
-- as Papel anti grasa) is populated.
CREATE TABLE IF NOT EXISTS catalog_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES catalog_product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER,
  flat_total_price INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT catalog_price_tiers_price_mode_chk CHECK (
    (unit_price IS NOT NULL AND flat_total_price IS NULL)
    OR (unit_price IS NULL AND flat_total_price IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_catalog_price_tiers_variant ON catalog_price_tiers(variant_id);
-- Two rungs at the same quantity would make tier selection ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_price_tiers_variant_qty ON catalog_price_tiers(variant_id, quantity);

ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_price_tiers ENABLE ROW LEVEL SECURITY;

-- Business-scoped membership policy, FOR ALL (unlike `business_features`,
-- which is SELECT-only because only ops tooling writes it — this catalog is
-- read AND written by the app itself). Matches `pipeline_cards_member`.
CREATE POLICY catalog_products_member ON public.catalog_products FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

-- The child tables carry no `business_id` of their own, so they scope through
-- the parent, the same way `invoice_items` scopes through `invoices`.
CREATE POLICY catalog_product_variants_member ON public.catalog_product_variants FOR ALL TO authenticated
  USING (
    product_id IN (
      SELECT id FROM public.catalog_products
      WHERE business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    product_id IN (
      SELECT id FROM public.catalog_products
      WHERE business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY catalog_price_tiers_member ON public.catalog_price_tiers FOR ALL TO authenticated
  USING (
    variant_id IN (
      SELECT v.id FROM public.catalog_product_variants v
      JOIN public.catalog_products p ON p.id = v.product_id
      WHERE p.business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    variant_id IN (
      SELECT v.id FROM public.catalog_product_variants v
      JOIN public.catalog_products p ON p.id = v.product_id
      WHERE p.business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Down Migration
DROP POLICY IF EXISTS catalog_price_tiers_member ON public.catalog_price_tiers;
DROP POLICY IF EXISTS catalog_product_variants_member ON public.catalog_product_variants;
DROP POLICY IF EXISTS catalog_products_member ON public.catalog_products;

DROP TABLE IF EXISTS catalog_price_tiers CASCADE;
DROP TABLE IF EXISTS catalog_product_variants CASCADE;
DROP TABLE IF EXISTS catalog_products CASCADE;
