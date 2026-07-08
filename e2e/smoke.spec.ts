import { test, expect } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/create next app/i);
  await expect(
    page.getByText(/to get started, edit the page\.tsx file\./i)
  ).toBeVisible();
});

/**
 * Same currency formatting as `lib/money.ts`'s `formatCOP` — duplicated here
 * (not imported) because `e2e/*.spec.ts` runs through Playwright's own test
 * runner, outside the Next.js/Vitest module graph, and this project does not
 * configure a `@/*` path alias for it. Any drift here would only ever make
 * this test brittle against itself, never mask a real production bug (the
 * assertions below always compare against a value computed independently
 * from the real, server-persisted invoice/payment amounts, not against
 * `lib/money.ts` itself).
 */
function formatCOP(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Falls back to the same defaults as `lib/mock/auth-adapter.ts`'s
 * `resolveDemoCredentials()` — see `.env.example` and `playwright.config.ts`.
 */
const DEMO_LOGIN_EMAIL = process.env.DEMO_LOGIN_EMAIL || "demo@negociodemo.test";
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "demo1234";

/**
 * Full end-to-end flow through the real browser against the real running
 * dev server (mock backend, in-memory store) — the single most important
 * verification that the whole mocked MVP works end to end as a real user
 * would experience it, per
 * `openspec/changes/mocked-mvp-scaffold/tasks.md`'s Phase 8 (task 8.1).
 *
 * Covers, in order: login with demo credentials -> land on dashboard ->
 * create a customer -> create an invoice for that customer with one item ->
 * assert the server-computed total and `pending` status -> register a
 * partial payment -> assert the balance decreases and status becomes
 * `partially_paid` -> open the invoice's printable receipt and assert the
 * exact, non-removable DIAN legal notice text
 * (`components/domain/receipts/dian-notice.tsx`) is visible.
 *
 * There is no persistent sidebar/nav in this MVP scaffold (a pre-existing,
 * documented scope gap — `docs/ui-ux-flow.md` describes screens, not a nav
 * shell, and no `app/(dashboard)/layout.tsx` was ever added across PR1-PR9).
 * Top-level section changes below use `page.goto` for that reason — this
 * still exercises every real page/route/session-guard along the way, it
 * just doesn't click a nav link that doesn't exist in the app.
 */
test.describe("Full MVP flow (real browser, real running server, real mock backend)", () => {
  test("login -> create customer -> create invoice -> partial payment -> printable receipt", async ({ page }) => {
    const runId = Date.now();
    const customerName = `Cliente E2E ${runId}`;

    // 1. Login with demo credentials.
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO_LOGIN_EMAIL);
    await page.getByLabel("Contrasena").fill(DEMO_LOGIN_PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();

    // 2. Land on the dashboard.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // 3. Navigate to customers and create a new one via the dialog.
    await page.goto("/customers");
    await page.getByRole("button", { name: "Crear cliente" }).click();
    await page.getByLabel("Nombre").fill(customerName);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("link", { name: customerName })).toBeVisible();

    // 4. Navigate to invoices and create a new invoice for that customer,
    // with at least one item.
    await page.goto("/invoices/new");
    await page.getByLabel("Cliente").selectOption({ label: customerName });
    await page.getByLabel("Descripcion").fill("Servicio E2E completo");
    await page.getByLabel("Cantidad").fill("1");
    await page.getByLabel("Valor unitario (COP)").fill("100000");

    // Client-side running total (UX only) already matches the server's
    // authoritative computation (`lib/services/invoice-service.ts`).
    const totalCents = 1 * 100000 * 100; // 1 x $100.000 (pesos) -> 10,000,000 cents
    await expect(page.getByText(`Total: ${formatCOP(totalCents)}`)).toBeVisible();

    await page.getByRole("button", { name: "Crear factura" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);

    // 5. Assert the invoice shows the correct SERVER-computed total and the
    // `pending` status (no payments registered yet).
    await expect(page.getByText(formatCOP(totalCents), { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();

    const invoiceId = new URL(page.url()).pathname.split("/").pop()!;

    // 6. Register a partial payment on it.
    const partialPaymentPesos = 40000; // $40.000, less than the $100.000 total
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await page.getByLabel("Monto").fill(String(partialPaymentPesos));
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // 7. Assert the balance decreases and the status becomes `partially_paid`.
    const expectedBalanceCents = totalCents - partialPaymentPesos * 100; // 6,000,000 cents
    await expect(page.getByText(formatCOP(expectedBalanceCents), { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Parcialmente pagada", { exact: true })).toBeVisible();

    // 8. Navigate to the invoice's printable receipt and assert the exact
    // DIAN legal notice text is visible.
    await page.goto(`/invoices/${invoiceId}/receipt`);
    await expect(
      page.getByText("Documento interno, no valido como factura electronica DIAN.", { exact: true })
    ).toBeVisible();
  });
});
