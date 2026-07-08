import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Genuine concurrency proof against the REAL running dev server — real HTTP
 * requests hitting the real Next.js route handlers -> services -> mock
 * repositories -> `withLock`, not a unit-level test that calls the
 * repository layer directly (that already exists from PR1:
 * `lib/mock/invoice-repo.test.ts`, `lib/mock/payment-repo.test.ts`). This is
 * the final, end-to-end re-confirmation of both safety-critical guarantees
 * per `openspec/changes/mocked-mvp-scaffold/tasks.md`'s Phase 8 (task 8.2):
 *
 * (a) invoice numbering stays unique per business under real concurrent load
 * (b) payment overpay is genuinely impossible under real concurrent load
 *
 * Uses Playwright's `request` fixture (an `APIRequestContext` scoped to this
 * test, configured with the same `baseURL` as `playwright.config.ts`'s `use`
 * block) — it maintains its own cookie jar, so the session cookie set by
 * `POST /api/auth/login` is automatically carried on every subsequent call
 * within the same test.
 */

const DEMO_LOGIN_EMAIL = process.env.DEMO_LOGIN_EMAIL || "demo@negociodemo.test";
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "demo1234";

/**
 * `checkOrigin` (`lib/server/origin-check.ts`) fails OPEN when `APP_ORIGIN`
 * is unset (typical local/dev), but sends a real `Origin` header anyway so
 * this proof also holds in an environment where `APP_ORIGIN` IS configured.
 */
const JSON_HEADERS = { "content-type": "application/json", origin: "http://localhost:3000" };

async function signIn(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/login", {
    headers: JSON_HEADERS,
    data: { email: DEMO_LOGIN_EMAIL, password: DEMO_LOGIN_PASSWORD },
  });
  if (response.status() !== 200) {
    throw new Error(
      `Demo sign-in failed with status ${response.status()}: ${await response.text()}`
    );
  }
}

async function createCustomer(request: APIRequestContext, name: string): Promise<{ id: string }> {
  const response = await request.post("/api/customers", {
    headers: JSON_HEADERS,
    data: { name },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return body.data;
}

test.describe("Real-HTTP concurrency proof (route handler -> service -> repo -> lock, real server)", () => {
  test("(a) invoice numbering stays unique per business under real concurrent HTTP load", async ({ request }) => {
    await signIn(request);
    const customer = await createCustomer(request, `Cliente Concurrencia Numeracion ${Date.now()}`);

    const CONCURRENT_COUNT = 8;
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_COUNT }, (_, index) =>
        request.post("/api/invoices", {
          headers: JSON_HEADERS,
          data: {
            customerId: customer.id,
            issueDate: "2026-07-01",
            items: [{ description: `Item concurrente ${index}`, quantity: 1, unitPrice: 1000 }],
          },
        })
      )
    );

    // Every single one of the N simultaneous creates must succeed — none may
    // be dropped or silently fail as a side effect of serialization.
    for (const response of responses) {
      expect(response.status()).toBe(201);
    }

    const bodies = await Promise.all(responses.map((response) => response.json()));
    const numbers: string[] = bodies.map((body) => body.data.number);

    expect(numbers).toHaveLength(CONCURRENT_COUNT);
    // The real proof: no two concurrent, real HTTP requests ever produced
    // the same invoice number for the same business.
    expect(new Set(numbers).size).toBe(CONCURRENT_COUNT);
  });

  test("(b) payment overpay is genuinely impossible under real concurrent HTTP load", async ({ request }) => {
    await signIn(request);
    const customer = await createCustomer(request, `Cliente Concurrencia Pago ${Date.now()}`);

    const TOTAL_CENTS = 10_000_000; // $100.000
    const invoiceResponse = await request.post("/api/invoices", {
      headers: JSON_HEADERS,
      data: {
        customerId: customer.id,
        issueDate: "2026-07-01",
        items: [{ description: "Servicio concurrencia pago", quantity: 1, unitPrice: TOTAL_CENTS }],
      },
    });
    expect(invoiceResponse.status()).toBe(201);
    const { data: invoice } = await invoiceResponse.json();
    expect(invoice.total).toBe(TOTAL_CENTS);
    expect(invoice.balance).toBe(TOTAL_CENTS);

    // Each payment ($60.000) individually fits within the $100.000 balance,
    // but their SUM ($120.000) exceeds it — exactly one of the two
    // simultaneous requests must be accepted.
    const PAYMENT_CENTS = 6_000_000;
    const [responseA, responseB] = await Promise.all([
      request.post(`/api/invoices/${invoice.id}/payments`, {
        headers: JSON_HEADERS,
        data: { paymentDate: "2026-07-02", amount: PAYMENT_CENTS },
      }),
      request.post(`/api/invoices/${invoice.id}/payments`, {
        headers: JSON_HEADERS,
        data: { paymentDate: "2026-07-02", amount: PAYMENT_CENTS },
      }),
    ]);

    const statuses = [responseA.status(), responseB.status()].sort((a, b) => a - b);
    // Per this project's established convention (see
    // `app/api/invoices/[id]/payments/payments-routes.test.ts`'s "rejects an
    // overpay attempt" case), the rejection is `400 VALIDATION_ERROR`, not
    // `422` — exactly one 201 (accepted) and one 400 (rejected).
    expect(statuses).toEqual([201, 400]);

    const rejected = responseA.status() === 400 ? responseA : responseB;
    const rejectedBody = await rejected.json();
    expect(rejectedBody.error.code).toBe("VALIDATION_ERROR");

    // The real proof: read the FINAL persisted state back from the server
    // (not the in-memory response of either racing request) and confirm the
    // balance reflects EXACTLY one accepted payment and is never negative.
    const finalInvoiceResponse = await request.get(`/api/invoices/${invoice.id}`);
    expect(finalInvoiceResponse.status()).toBe(200);
    const { data: finalInvoice } = await finalInvoiceResponse.json();

    expect(finalInvoice.balance).toBe(TOTAL_CENTS - PAYMENT_CENTS);
    expect(finalInvoice.balance).toBeGreaterThanOrEqual(0);
    expect(finalInvoice.status).toBe("partially_paid");
  });
});
