-- Up Migration
--
-- Link an invoice line to an inventory product so selecting a product on an
-- invoice decrements its stock (an `out` inventory_movement is created in the
-- same transaction as the invoice — see lib/db/invoice-repo.ts). Nullable:
-- a free-text "Otro" line has no product_id and touches no inventory.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Down Migration
ALTER TABLE invoice_items DROP COLUMN IF EXISTS product_id;
