-- Up Migration
--
-- NUMBERING: this is 18000, not 16000, even though `main` stops at 15000.
-- 16000 (`add_catalog_products`) and 17000 (`add_quotes`) belong to the
-- unmerged `feat/cotizador` branch and are ALREADY APPLIED to the shared
-- database, so reusing either number would collide, and any number below
-- 17000 would make node-pg-migrate refuse to run ("Not run migration is
-- preceding already run migration"). The gap in this folder is expected
-- until that branch merges.
--
-- Supporting indexes for the product/customer hard-delete transactions added
-- alongside this migration (`lib/db/product-repo.ts#delete`,
-- `lib/db/customer-repo.ts#delete`). Both hold a `FOR UPDATE` row lock while
-- they run, so keeping their scans off sequential access matters: the lock is
-- held for the duration.
--
--   * `invoice_items.product_id` — added nullable in
--     `1700000013000_invoice_items_product.sql` with no index. Scanned by the
--     product delete's reference count. Partial (`WHERE product_id IS NOT
--     NULL`) because free-text "Otro" lines are NULL and can never match.
--   * `payments.customer_id` — only `idx_payments_invoice` and
--     `idx_payments_business` existed. Scanned by the customer delete's
--     reference count. (`invoices.customer_id` already has
--     `idx_invoices_customer` from the baseline.)
--
-- The foreign keys themselves deliberately KEEP `ON DELETE NO ACTION`. That
-- is the backstop: if the application-level guard were ever bypassed,
-- Postgres refuses to orphan a financial record rather than silently
-- cascading. Both deletes satisfy it by refusing outright once anything
-- references the row.
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

-- Down Migration
DROP INDEX IF EXISTS idx_invoice_items_product;
DROP INDEX IF EXISTS idx_payments_customer;
