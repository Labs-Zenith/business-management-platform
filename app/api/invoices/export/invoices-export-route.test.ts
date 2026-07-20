import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";

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

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

describe("GET /api/invoices/export", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("exports filtered invoices to a real xlsx workbook", async () => {
    await signIn();

    const response = await GET(new Request("http://localhost:3000/api/invoices/export?format=xlsx&status=overdue&page=99"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.getWorksheet("Facturas");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="facturas-/);
    expect(sheet).toBeDefined();
    expect(sheet!.getRow(1).values).toEqual([
      undefined,
      "Número",
      "Cliente",
      "Fecha",
      "Vencimiento",
      "Total",
      "Pagado",
      "Saldo",
      "Estado",
    ]);
    expect(sheet!.rowCount).toBeGreaterThan(1);
    for (let rowNumber = 2; rowNumber <= sheet!.rowCount; rowNumber += 1) {
      expect(sheet!.getRow(rowNumber).getCell(8).value).toBe("Vencida");
    }
  });

  it("exports filtered invoices to a PDF attachment", async () => {
    await signIn();

    const response = await GET(new Request("http://localhost:3000/api/invoices/export?format=pdf&status=overdue"));
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="facturas-/);
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("rejects unsupported export formats", async () => {
    await signIn();

    const response = await GET(new Request("http://localhost:3000/api/invoices/export?format=csv"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
