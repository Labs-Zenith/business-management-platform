import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";

/**
 * Same in-memory cookie jar strategy as `app/api/invoices/export/invoices-export-route.test.ts`:
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context, so this mocks the primitive with a stateful jar shared across a
 * single test — this exercises the REAL `authAdapter` -> `session.ts` ->
 * route handler code path, only faking the underlying cookie storage.
 */
const { mockCookieJar } = vi.hoisted(() => {
  const jarStore = new Map<string, string>();
  return {
    mockCookieJar: {
      get(name: string) {
        return jarStore.has(name) ? { name, value: jarStore.get(name)! } : undefined;
      },
      set(name: string, value: string) {
        jarStore.set(name, value);
      },
      delete(name: string) {
        jarStore.delete(name);
      },
      clear() {
        jarStore.clear();
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => mockCookieJar,
}));

const { GET } = await import("./route");

const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

const SHEET_NAMES = [
  "Resumen",
  "Saldo por estado",
  "Mayores saldos",
  "Pagos por mes",
  "Facturas vencidas",
  "Pagos recientes",
  "Gastos por categoria",
  "Gastos recientes",
];

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/**
 * Switches the signed-in session to a brand-new, never-seeded `businessId`
 * — no customers, invoices, payments, or expenses exist for it anywhere in
 * the store — so every dashboard/expense composite resolves to its
 * zero/empty shape. `switchBusiness` performs no membership check of its
 * own (see `lib/mock/auth-adapter.ts`'s JSDoc), which is exactly what a
 * route-level empty-state test needs here.
 */
async function switchToEmptyBusiness(): Promise<void> {
  const session = await repositories.auth.switchBusiness(crypto.randomUUID(), "admin");
  if (!session) {
    throw new Error("Test setup failed: switching to an empty business did not succeed.");
  }
}

describe("GET /api/dashboard/export", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("exports the full dashboard to a real xlsx workbook with one sheet per section", async () => {
    await signIn();

    const response = await GET(new Request("http://localhost:3000/api/dashboard/export?format=xlsx"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="dashboard-/);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEET_NAMES);

    const resumen = workbook.getWorksheet("Resumen")!;
    expect(resumen.getRow(1).values).toEqual([undefined, "Concepto", "Valor"]);
    expect(resumen.rowCount).toBe(5);
  });

  it("exports the full dashboard to a PDF attachment", async () => {
    await signIn();

    const response = await GET(new Request("http://localhost:3000/api/dashboard/export?format=pdf"));
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="dashboard-/);
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(4);
  });

  it("rejects a missing format with a 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await GET(new Request("http://localhost:3000/api/dashboard/export"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unsupported export format with a 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await GET(new Request("http://localhost:3000/api/dashboard/export?format=csv"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("exports successfully for a business with zero invoices, payments, and expenses", async () => {
    await signIn();
    await switchToEmptyBusiness();

    const xlsxResponse = await GET(new Request("http://localhost:3000/api/dashboard/export?format=xlsx"));
    expect(xlsxResponse.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await xlsxResponse.arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEET_NAMES);
    // Fixed-order sheets still emit their fixed rows (zeros); list sheets are header-only.
    expect(workbook.getWorksheet("Saldo por estado")!.rowCount).toBe(5);
    expect(workbook.getWorksheet("Mayores saldos")!.rowCount).toBe(1);
    expect(workbook.getWorksheet("Facturas vencidas")!.rowCount).toBe(1);
    expect(workbook.getWorksheet("Pagos recientes")!.rowCount).toBe(1);
    expect(workbook.getWorksheet("Gastos recientes")!.rowCount).toBe(1);

    const pdfResponse = await GET(new Request("http://localhost:3000/api/dashboard/export?format=pdf"));
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    expect(pdfResponse.status).toBe(200);
    expect(pdfBytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });
});
