import { type Page, expect } from "@playwright/test";

/**
 * Shared Playwright helpers for the growing `e2e/*.spec.ts` suite.
 *
 * Deliberately a RELATIVE import (never `@/*`) — Playwright's own test
 * runner executes these files outside the Next.js/Vitest module graph,
 * which does not configure a `@/*` path alias for it (same rationale as
 * `smoke.spec.ts`'s locally-duplicated `formatCOP`). Keep this file
 * dependency-free (only `@playwright/test`) so it never accidentally pulls
 * in a server-only module.
 *
 * `smoke.spec.ts` and `concurrency.spec.ts` predate this file and keep
 * their own inline copies of the pieces they need — only NEW specs added
 * alongside this file import from here.
 */

/**
 * Falls back to the same defaults as `lib/mock/auth-adapter.ts`'s
 * `resolveDemoCredentials()` — see `.env.example` and `playwright.config.ts`.
 */
export const DEMO_LOGIN_EMAIL = process.env.DEMO_LOGIN_EMAIL || "demo@negociodemo.test";
export const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "demo1234";

/**
 * Same currency formatting as `lib/money.ts`'s `formatCOP` — duplicated here
 * (not imported) for the same reason `smoke.spec.ts`'s copy exists: this
 * file runs outside the Next.js module graph. Any drift here would only
 * ever make a test brittle against itself, never mask a real production
 * bug (assertions always compare against a value computed independently
 * from real, server-persisted amounts, never against `lib/money.ts` itself).
 */
export function formatCOP(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Logs in with the demo credentials and waits for the dashboard to load.
 * Mirrors `smoke.spec.ts`'s inline login steps exactly.
 */
export async function login(
  page: Page,
  email: string = DEMO_LOGIN_EMAIL,
  password: string = DEMO_LOGIN_PASSWORD,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/**
 * Navigates to Clientes via the real nav link (not `page.goto`) and creates
 * a customer through the "Crear cliente" dialog, mirroring `smoke.spec.ts`'s
 * proven flow. `.first()` disambiguates the desktop sidebar vs. mobile
 * bottom nav duplicate "Clientes" link (both always render; only CSS
 * visibility differs per breakpoint).
 */
export async function createCustomer(page: Page, name: string): Promise<void> {
  const clientesLink = page.getByRole("link", { name: "Clientes" }).first();
  await clientesLink.click();
  await expect(page).toHaveURL(/\/customers$/);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("link", { name })).toBeVisible();
}

export type CreateInvoiceOptions = {
  description?: string;
  quantity?: number;
  /** Whole COP pesos (matches the "Valor unitario (COP)" field's convention). */
  unitPricePesos: number;
};

export type CreatedInvoice = {
  id: string;
  /** Integer minor units (COP cents) — server-computed total for a single-item invoice. */
  totalCents: number;
};

/**
 * Creates an invoice for `customerName` (which must already exist — see
 * `createCustomer`) with a single item, via `/invoices/new`. Returns the
 * created invoice's id (parsed from the resulting detail-page URL) and the
 * expected total in cents.
 */
export async function createInvoice(
  page: Page,
  customerName: string,
  options: CreateInvoiceOptions,
): Promise<CreatedInvoice> {
  const { description = "Servicio E2E", quantity = 1, unitPricePesos } = options;

  await page.goto("/invoices/new");
  await page.getByLabel("Cliente").selectOption({ label: customerName });
  await page.getByLabel("Descripcion").fill(description);
  await page.getByLabel("Cantidad").fill(String(quantity));
  await page.getByLabel("Valor unitario (COP)").fill(String(unitPricePesos));
  await page.getByRole("button", { name: "Crear factura" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

  const id = new URL(page.url()).pathname.split("/").pop()!;
  const totalCents = quantity * unitPricePesos * 100;
  return { id, totalCents };
}

/**
 * Registers a payment on the invoice detail page currently loaded (the
 * "Registrar pago" trigger must be visible, i.e. `balance > 0`).
 */
export async function registerPayment(page: Page, amountPesos: number): Promise<void> {
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Monto").fill(String(amountPesos));
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
