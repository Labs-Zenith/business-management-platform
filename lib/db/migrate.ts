import { sql } from "./client";
import {
  BUSINESS_ID,
  DEMO_PROFILE_ID,
  DEMO_USER_ID,
  businessFixture,
  demoProfileFixture,
} from "@/lib/mock/fixtures/data";

/**
 * Idempotent schema creation + demo seed, matching `docs/database-model.md`.
 * Runs at most once per warm serverless instance (memoized), and every
 * statement is `IF NOT EXISTS`/`ON CONFLICT DO NOTHING` so re-running it
 * across cold starts is always safe.
 */
let migrated = false;

export async function ensureMigrated(): Promise<void> {
  if (migrated) return;

  await sql`
    CREATE TABLE IF NOT EXISTS businesses (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      currency TEXT NOT NULL DEFAULT 'COP',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL UNIQUE,
      business_id UUID NOT NULL REFERENCES businesses(id),
      full_name TEXT,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id),
      name TEXT NOT NULL,
      document_number TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS invoice_sequences (
      business_id UUID PRIMARY KEY,
      seq INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id),
      customer_id UUID NOT NULL REFERENCES customers(id),
      number TEXT NOT NULL,
      issue_date DATE NOT NULL,
      due_date DATE,
      subtotal INTEGER NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(business_id, number)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id UUID PRIMARY KEY,
      invoice_id UUID NOT NULL REFERENCES invoices(id),
      description TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      business_id UUID NOT NULL REFERENCES businesses(id),
      invoice_id UUID NOT NULL REFERENCES invoices(id),
      customer_id UUID NOT NULL REFERENCES customers(id),
      payment_date DATE NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id)`;

  // Seed the demo business + profile (same constants as lib/mock/fixtures,
  // so login/demo credentials behave identically in both backends).
  await sql`
    INSERT INTO businesses (id, name, email, phone, address, currency)
    VALUES (${BUSINESS_ID}, ${businessFixture.name}, ${businessFixture.email}, ${businessFixture.phone}, ${businessFixture.address}, ${businessFixture.currency})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO profiles (id, user_id, business_id, full_name, email)
    VALUES (${DEMO_PROFILE_ID}, ${DEMO_USER_ID}, ${BUSINESS_ID}, ${demoProfileFixture.fullName}, ${demoProfileFixture.email})
    ON CONFLICT (id) DO NOTHING
  `;

  migrated = true;
}
