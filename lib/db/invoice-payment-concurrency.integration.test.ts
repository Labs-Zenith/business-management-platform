import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client as PgClient } from "pg";

/**
 * RE-RUNNABLE empirical proof of the invoice-edit vs. payment-record
 * concurrency fix (`lib/db/invoice-repo.ts#update` +
 * `lib/db/payment-repo.ts#createForInvoice`).
 *
 * This is the committed replacement for the original throwaway manual harness.
 * It reproduces the exact race that motivated the two-statement `FOR UPDATE`
 * transaction against a REAL Postgres container and proves the shipped SQL
 * holds: no interleaving ever yields BOTH a committed edit and a committed
 * payment on the same invoice.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INTENTIONALLY EXCLUDED FROM THE DEFAULT `npm test` / CI RUN.
 * ─────────────────────────────────────────────────────────────────────────
 * This repo has no standing test-DB infrastructure and CI/sandbox environments
 * may not have Docker. The whole suite is gated behind
 * `describe.skipIf(!process.env.RUN_DB_INTEGRATION_TESTS)`, so a normal
 * `npm test` collects but SKIPS it (zero connection attempts, `pg` is only
 * imported inside `beforeAll`, which does not run when the describe is skipped).
 *
 * HOW TO RUN IT MANUALLY (requires Docker):
 *
 *   1. Start a throwaway Postgres 16 container:
 *        docker run --rm -d --name bmp-pg-test \
 *          -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
 *
 *   2. Run just this file with the gate + connection string set:
 *        RUN_DB_INTEGRATION_TESTS=1 \
 *        TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres \
 *        npx vitest run lib/db/invoice-payment-concurrency.integration.test.ts
 *
 *   3. Tear the container down:
 *        docker rm -f bmp-pg-test
 *
 * The test connects to `TEST_DATABASE_URL` (falling back to
 * `DATABASE_URL_UNPOOLED`, then the localhost:5433 default above), creates the
 * minimal schema it needs, and cleans up its own rows.
 *
 * DETERMINISTIC OVERLAP TECHNIQUE (mirrors the manual harness that found the
 * bug): two separate `pg` connections run the two transactions. One acquires
 * the invoice-row `FOR UPDATE` lock and is HELD OPEN; the other issues its own
 * `FOR UPDATE` which blocks on that lock; we poll `pg_stat_activity` until it
 * is genuinely waiting, then commit the first and let the second proceed. This
 * forces the exact interleave a fixed sleep could only hope to hit.
 */

const RUN_INTEGRATION = Boolean(process.env.RUN_DB_INTEGRATION_TESTS);

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "postgresql://postgres:postgres@127.0.0.1:5433/postgres";

const BUSINESS_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CUSTOMER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const INVOICE_ID = "cccccccc-0000-4000-8000-000000000001";

// SQL mirrored VERBATIM from the shipped repositories, so this test genuinely
// exercises the production statements, not a paraphrase.
const PAYMENT_LOCK_SQL = "SELECT id, customer_id FROM invoices WHERE id = $1 AND business_id = $2 FOR UPDATE";
const PAYMENT_INSERT_SQL = `
  WITH bal AS (
    SELECT i.id, i.customer_id,
      i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS balance
    FROM invoices i
    WHERE i.id = $1 AND i.business_id = $2
  )
  INSERT INTO payments (id, business_id, invoice_id, customer_id, payment_date, amount, method, notes)
  SELECT gen_random_uuid(), $3, bal.id, bal.customer_id, $4, $5, $6, $7
  FROM bal
  WHERE $8 <= bal.balance
  RETURNING id`;

const EDIT_LOCK_SQL = "SELECT id FROM invoices WHERE id = $1 AND business_id = $2 FOR UPDATE";
const EDIT_UPDATE_SQL = `
  UPDATE invoices SET
    customer_id = $1, issue_date = $2, due_date = $3, subtotal = $4, total = $5,
    status = $6, notes = $7, updated_at = now()
  WHERE id = $8 AND business_id = $9
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = invoices.id)
  RETURNING id`;
// Each production `${}` is a DISTINCT placeholder (even when the same value),
// so the guard's id/businessId get their own params — otherwise Postgres
// deduces inconsistent types for a placeholder reused as both text and uuid.
const EDIT_DELETE_SQL = `
  DELETE FROM invoice_items
  WHERE invoice_id = $1
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = $2 AND i.business_id = $3
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)
    )`;
const EDIT_INSERT_SQL = `
  INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total)
  SELECT gen_random_uuid(), $1, $2, $3, $4, $5
  WHERE EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = $6 AND i.business_id = $7
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)
  )`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!RUN_INTEGRATION)("invoice-edit vs payment-record concurrency (real Postgres)", () => {
  let setup: PgClient;
  let clientA: PgClient;
  let clientB: PgClient;

  async function connect(): Promise<PgClient> {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: CONNECTION_STRING });
    await client.connect();
    return client;
  }

  async function ensureSchema(): Promise<void> {
    await setup.query(`
      CREATE TABLE IF NOT EXISTS businesses (id UUID PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY, business_id UUID NOT NULL REFERENCES businesses(id), name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY, business_id UUID NOT NULL REFERENCES businesses(id),
        customer_id UUID NOT NULL REFERENCES customers(id), number TEXT NOT NULL,
        issue_date DATE NOT NULL, due_date DATE, subtotal INTEGER NOT NULL, total INTEGER NOT NULL,
        status TEXT NOT NULL, notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS invoice_items (
        id UUID PRIMARY KEY, invoice_id UUID NOT NULL REFERENCES invoices(id),
        description TEXT NOT NULL, quantity NUMERIC NOT NULL, unit_price INTEGER NOT NULL, line_total INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY, business_id UUID NOT NULL REFERENCES businesses(id),
        invoice_id UUID NOT NULL REFERENCES invoices(id), customer_id UUID NOT NULL REFERENCES customers(id),
        payment_date DATE NOT NULL, amount INTEGER NOT NULL, method TEXT, notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    `);
    await setup.query("INSERT INTO businesses (id, name) VALUES ($1, 'Test Biz') ON CONFLICT (id) DO NOTHING", [
      BUSINESS_ID,
    ]);
    await setup.query(
      "INSERT INTO customers (id, business_id, name) VALUES ($1, $2, 'Test Customer') ON CONFLICT (id) DO NOTHING",
      [CUSTOMER_ID, BUSINESS_ID],
    );
  }

  /** Seeds a fresh, zero-payment invoice (total = 100000) with one line item. */
  async function seedInvoice(): Promise<void> {
    // Clear any transaction a prior (possibly failed) run left open on the two
    // worker connections, so their held locks never block the setup cleanup.
    await clientA.query("ROLLBACK").catch(() => {});
    await clientB.query("ROLLBACK").catch(() => {});
    await setup.query("DELETE FROM payments WHERE invoice_id = $1", [INVOICE_ID]);
    await setup.query("DELETE FROM invoice_items WHERE invoice_id = $1", [INVOICE_ID]);
    await setup.query("DELETE FROM invoices WHERE id = $1", [INVOICE_ID]);
    await setup.query(
      `INSERT INTO invoices (id, business_id, customer_id, number, issue_date, due_date, subtotal, total, status, notes)
       VALUES ($1, $2, $3, 'FAC-0001', '2026-07-01', '2026-08-01', 100000, 100000, 'pending', null)`,
      [INVOICE_ID, BUSINESS_ID, CUSTOMER_ID],
    );
    await setup.query(
      `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, line_total)
       VALUES (gen_random_uuid(), $1, 'Original', 1, 100000, 100000)`,
      [INVOICE_ID],
    );
  }

  /** Polls pg_stat_activity until at least one backend is waiting on a lock. */
  async function waitForBlocked(): Promise<void> {
    for (let i = 0; i < 200; i += 1) {
      const { rows } = await setup.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND state = 'active'",
      );
      if (rows[0].n > 0) return;
      await sleep(25);
    }
    throw new Error("Timed out waiting for the second transaction to block on the invoice row lock");
  }

  async function invoiceState() {
    const inv = await setup.query("SELECT total, subtotal, status FROM invoices WHERE id = $1", [INVOICE_ID]);
    const pay = await setup.query("SELECT COALESCE(SUM(amount), 0)::int AS paid, count(*)::int AS n FROM payments WHERE invoice_id = $1", [
      INVOICE_ID,
    ]);
    const items = await setup.query("SELECT COALESCE(SUM(line_total), 0)::int AS items_total, count(*)::int AS n FROM invoice_items WHERE invoice_id = $1", [
      INVOICE_ID,
    ]);
    return {
      total: inv.rows[0].total as number,
      status: inv.rows[0].status as string,
      paid: pay.rows[0].paid as number,
      paymentCount: pay.rows[0].n as number,
      itemsTotal: items.rows[0].items_total as number,
      itemCount: items.rows[0].n as number,
    };
  }

  beforeAll(async () => {
    setup = await connect();
    clientA = await connect();
    clientB = await connect();
    await ensureSchema();
  }, 30000);

  afterAll(async () => {
    // Roll back any transaction still open on the workers so their locks don't
    // block the row cleanup below.
    await clientA?.query("ROLLBACK").catch(() => {});
    await clientB?.query("ROLLBACK").catch(() => {});
    // Best-effort cleanup of our rows + connections.
    if (setup) {
      await setup.query("DELETE FROM payments WHERE invoice_id = $1", [INVOICE_ID]).catch(() => {});
      await setup.query("DELETE FROM invoice_items WHERE invoice_id = $1", [INVOICE_ID]).catch(() => {});
      await setup.query("DELETE FROM invoices WHERE id = $1", [INVOICE_ID]).catch(() => {});
    }
    await Promise.all([clientA?.end(), clientB?.end(), setup?.end()].map((p) => p?.catch?.(() => {}) ?? p));
  }, 30000);

  it("payment-first ordering: a payment that commits first blocks and then REJECTS a concurrent edit (never both)", async () => {
    const RUNS = 5;
    for (let run = 0; run < RUNS; run += 1) {
      await seedInvoice();

      // clientA (payment) acquires and HOLDS the invoice lock.
      await clientA.query("BEGIN");
      await clientA.query(PAYMENT_LOCK_SQL, [INVOICE_ID, BUSINESS_ID]);

      // clientB (edit) begins and issues its FOR UPDATE — this BLOCKS.
      await clientB.query("BEGIN");
      const editLock = clientB.query(EDIT_LOCK_SQL, [INVOICE_ID, BUSINESS_ID]);
      await waitForBlocked();

      // clientA records a full payment and commits, releasing the lock.
      const pay = await clientA.query(PAYMENT_INSERT_SQL, [
        INVOICE_ID,
        BUSINESS_ID,
        BUSINESS_ID,
        "2026-07-05",
        100000,
        "cash",
        null,
        100000, // $8: the `${amount} <= bal.balance` guard's own placeholder
      ]);
      expect(pay.rowCount).toBe(1); // payment succeeded
      await clientA.query("COMMIT");

      // clientB unblocks; its guarded UPDATE now sees the committed payment and
      // must affect ZERO rows (edit rejected), same for delete/insert.
      await editLock;
      const upd = await clientB.query(EDIT_UPDATE_SQL, [
        CUSTOMER_ID,
        "2026-07-09",
        "2026-08-09",
        50000,
        50000,
        "pending",
        "edited",
        INVOICE_ID,
        BUSINESS_ID,
      ]);
      const del = await clientB.query(EDIT_DELETE_SQL, [INVOICE_ID, INVOICE_ID, BUSINESS_ID]);
      const ins = await clientB.query(EDIT_INSERT_SQL, [INVOICE_ID, "Edited", 5, 10000, 50000, INVOICE_ID, BUSINESS_ID]);
      await clientB.query("COMMIT");

      expect(upd.rowCount).toBe(0); // edit rejected
      expect(del.rowCount).toBe(0); // items untouched
      expect(ins.rowCount).toBe(0); // no new item inserted

      const state = await invoiceState();
      // Exactly one writer won: the payment. Edit left NOTHING changed.
      expect(state.paymentCount).toBe(1);
      expect(state.paid).toBe(100000);
      expect(state.total).toBe(100000); // NOT the edit's 50000
      expect(state.itemsTotal).toBe(100000); // original item intact
      expect(state.itemCount).toBe(1);
      // Consistency invariants.
      expect(state.total).toBe(state.itemsTotal);
      expect(state.paid).toBeLessThanOrEqual(state.total);
    }
  }, 60000);

  it("edit-first ordering (downward edit): an edit that commits first blocks and then REJECTS a payment that would overpay the NEW total (never both)", async () => {
    const RUNS = 5;
    for (let run = 0; run < RUNS; run += 1) {
      await seedInvoice();

      // clientB (edit) acquires the lock, lowers the total to 50000, replaces
      // items, and is HELD OPEN (not yet committed).
      await clientB.query("BEGIN");
      await clientB.query(EDIT_LOCK_SQL, [INVOICE_ID, BUSINESS_ID]);
      const upd = await clientB.query(EDIT_UPDATE_SQL, [
        CUSTOMER_ID,
        "2026-07-09",
        "2026-08-09",
        50000,
        50000,
        "pending",
        "edited-down",
        INVOICE_ID,
        BUSINESS_ID,
      ]);
      await clientB.query(EDIT_DELETE_SQL, [INVOICE_ID, INVOICE_ID, BUSINESS_ID]);
      await clientB.query(EDIT_INSERT_SQL, [INVOICE_ID, "Edited", 5, 10000, 50000, INVOICE_ID, BUSINESS_ID]);
      expect(upd.rowCount).toBe(1); // edit applied (uncommitted)

      // clientA (payment) begins and issues its FOR UPDATE — this BLOCKS.
      await clientA.query("BEGIN");
      const payLock = clientA.query(PAYMENT_LOCK_SQL, [INVOICE_ID, BUSINESS_ID]);
      await waitForBlocked();

      // clientB commits the downward edit, releasing the lock.
      await clientB.query("COMMIT");

      // clientA unblocks; a 100000 payment (fit the OLD total, overpays the NEW
      // 50000) must recompute against the FRESH post-edit balance and REJECT.
      await payLock;
      const pay = await clientA.query(PAYMENT_INSERT_SQL, [
        INVOICE_ID,
        BUSINESS_ID,
        BUSINESS_ID,
        "2026-07-05",
        100000,
        "cash",
        null,
        100000, // $8: the `${amount} <= bal.balance` guard's own placeholder
      ]);
      await clientA.query("COMMIT");

      expect(pay.rowCount).toBe(0); // overpay against the new total rejected

      const state = await invoiceState();
      // Exactly one writer won: the edit. No payment landed.
      expect(state.paymentCount).toBe(0);
      expect(state.paid).toBe(0);
      expect(state.total).toBe(50000); // the committed downward edit
      expect(state.itemsTotal).toBe(50000);
      expect(state.itemCount).toBe(1);
      // Consistency invariants: totals match items, no negative balance.
      expect(state.total).toBe(state.itemsTotal);
      expect(state.paid).toBeLessThanOrEqual(state.total);
    }
  }, 60000);
});
