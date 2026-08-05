-- Up Migration
--
-- Logical deletion ("anular") for invoices. An invoice created by mistake
-- could previously neither be deleted nor — once fully paid — even edited,
-- so the stock it consumed and the money it counted stayed wrong forever.
-- Voiding takes it out of every figure while keeping the row, its number and
-- its line items intact for audit.
--
--   * `invoices.voided_at`   — the marker. NULL means live. Its presence
--     OVERRIDES the derived status (`lib/services/status.ts#computeStatus`
--     works off total/paid/dueDate and cannot express "voided"), which is why
--     this is a column rather than a new value written into `status`.
--   * `invoices.voided_by`   — `auth.users(id)` of whoever voided it. No FK:
--     `payments`/`invoices` never reference auth users elsewhere, and an
--     account being removed must not block reading historic invoices.
--   * `invoices.void_reason` — required by the app, not by the schema: a NOT
--     NULL constraint would have to be conditional on `voided_at`, and the
--     rule belongs with the rest of the invoice rules in the service layer.
--   * `payments.voided_at`   — payments are voided together with their
--     invoice, so the money stops counting toward the customer's balance and
--     the dashboard without deleting the record of it.
--
-- NO index. `invoices` and `payments` hold tens of rows here, and both repos
-- already fetch business-scoped rows in bulk and filter in JS. Adding one now
-- would repeat the premature-optimisation of 1700000018000.
--
-- `invoices.status` has no CHECK constraint, so the new "voided" status the
-- read path derives needs no schema change of its own.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_by   UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;

-- Down Migration
ALTER TABLE invoices DROP COLUMN IF EXISTS voided_at;
ALTER TABLE invoices DROP COLUMN IF EXISTS voided_by;
ALTER TABLE invoices DROP COLUMN IF EXISTS void_reason;
ALTER TABLE payments DROP COLUMN IF EXISTS voided_at;
