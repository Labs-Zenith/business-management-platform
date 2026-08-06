-- Up Migration
--
-- Lets an invoice line bill a product from the commercial catalog
-- (`catalog_products`, see `1700000016000_add_catalog_products.sql`) the same
-- way it already bills one from inventory — which is the whole point of the
-- catalog: what it holds is mostly SERVICES, and a service has to be
-- invoiceable.
--
-- WHY A SECOND COLUMN INSTEAD OF REUSING `product_id`: that column is a
-- foreign key to `products` (inventory), and to `lib/db/invoice-repo.ts` a
-- non-null value there means, literally, "lock this product's row, verify
-- stock, and write an `out` inventory movement". There is no discriminator —
-- the ONLY way a line opts out of inventory today is `product_id IS NULL`.
-- Storing a catalog id there would be rejected by the foreign key (the two
-- tables share no rows), and even without the FK the repo's stock lookup
-- would fail. So a catalog line travels as `product_id IS NULL` plus this new
-- column, and every existing inventory code path — the decrement on create,
-- the reversal on edit, the stock return on void — skips it untouched,
-- because they all filter on `product_id IS NOT NULL`.
--
-- `ON DELETE SET NULL`, never CASCADE: deleting a catalog listing must forget
-- the backlink, never delete or alter a historical invoice line. The line's
-- `description`, `quantity` and `unit_price` are already its own snapshot, so
-- losing the backlink costs nothing but the "reopen in the catalog" link.
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES catalog_products(id) ON DELETE SET NULL;

-- A line has at most ONE source. Both set would mean "decrement stock AND
-- bill a service", which no code path implements and no user can express.
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_single_source_chk
  CHECK (product_id IS NULL OR catalog_product_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_invoice_items_catalog_product ON invoice_items(catalog_product_id);

-- Down Migration
DROP INDEX IF EXISTS idx_invoice_items_catalog_product;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_single_source_chk;
ALTER TABLE invoice_items DROP COLUMN IF EXISTS catalog_product_id;
