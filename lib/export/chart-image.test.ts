import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderExpensesByCategoryPng,
  renderExpensesByMonthPng,
  renderMonthlyPaymentsPng,
  renderReceivablesByStatusPng,
  renderTopDebtorsPng,
  safeChartPng,
  svgToPng,
} from "@/lib/export/chart-image";
import { renderBarChartSvg } from "@/lib/export/chart-svg";

const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function expectPng(buffer: Buffer) {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.subarray(0, 4).equals(PNG_MAGIC_BYTES)).toBe(true);
}

describe("svgToPng", () => {
  it("rasterizes an SVG string into a PNG buffer", async () => {
    const svg = renderBarChartSvg({ title: "Test", data: [{ label: "a", value: 10 }] });
    const png = await svgToPng(svg);
    expectPng(png);
  });

  it("rasterizes the empty-state SVG (no bars) without throwing", async () => {
    const svg = renderBarChartSvg({ title: "Test", data: [] });
    const png = await svgToPng(svg);
    expectPng(png);
  });
});

describe("dashboard chart PNG renderers", () => {
  it("renderReceivablesByStatusPng returns a PNG buffer", async () => {
    const png = await renderReceivablesByStatusPng([
      { status: "pending", label: "Pendiente", count: 2, balance: 300_000, total: 400_000 },
      { status: "partially_paid", label: "Parcial", count: 1, balance: 50_000, total: 100_000 },
      { status: "paid", label: "Pagada", count: 3, balance: 0, total: 300_000 },
      { status: "overdue", label: "Vencida", count: 1, balance: 100_000, total: 100_000 },
    ]);
    expectPng(png);
  });

  it("renderReceivablesByStatusPng handles the empty-state (all zero balances)", async () => {
    const png = await renderReceivablesByStatusPng([
      { status: "pending", label: "Pendiente", count: 0, balance: 0, total: 0 },
      { status: "partially_paid", label: "Parcial", count: 0, balance: 0, total: 0 },
      { status: "paid", label: "Pagada", count: 0, balance: 0, total: 0 },
      { status: "overdue", label: "Vencida", count: 0, balance: 0, total: 0 },
    ]);
    expectPng(png);
  });

  it("renderTopDebtorsPng returns a PNG buffer", async () => {
    const png = await renderTopDebtorsPng([{ id: "cust-1", name: "Cliente Uno", balance: 100_000 }]);
    expectPng(png);
  });

  it("renderTopDebtorsPng handles the empty-state (no debtors)", async () => {
    const png = await renderTopDebtorsPng([]);
    expectPng(png);
  });

  it("renderMonthlyPaymentsPng returns a PNG buffer", async () => {
    const png = await renderMonthlyPaymentsPng([
      { month: "2026-06", label: "jun", amount: 200_000 },
      { month: "2026-07", label: "jul", amount: 50_000 },
    ]);
    expectPng(png);
  });

  it("renderMonthlyPaymentsPng handles the empty-state (all zero amounts)", async () => {
    const png = await renderMonthlyPaymentsPng([
      { month: "2026-06", label: "jun", amount: 0 },
      { month: "2026-07", label: "jul", amount: 0 },
    ]);
    expectPng(png);
  });

  it("renderExpensesByCategoryPng returns a PNG buffer", async () => {
    const png = await renderExpensesByCategoryPng([
      { category: "nomina", label: "Nómina", total: 100_000 },
      { category: "otro", label: "Otro", total: 50_000 },
    ]);
    expectPng(png);
  });

  it("renderExpensesByCategoryPng handles the empty-state (all zero totals)", async () => {
    const png = await renderExpensesByCategoryPng([
      { category: "nomina", label: "Nómina", total: 0 },
      { category: "otro", label: "Otro", total: 0 },
    ]);
    expectPng(png);
  });

  it("renderExpensesByMonthPng returns a PNG buffer", async () => {
    const png = await renderExpensesByMonthPng([
      { month: "2026-06", label: "jun", amount: 120_000 },
      { month: "2026-07", label: "jul", amount: 80_000 },
    ]);
    expectPng(png);
  });

  it("renderExpensesByMonthPng handles the empty-state (no months)", async () => {
    const png = await renderExpensesByMonthPng([]);
    expectPng(png);
  });
});

describe("safeChartPng", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the real render's PNG when it succeeds", async () => {
    const png = await safeChartPng(() =>
      renderReceivablesByStatusPng([
        { status: "pending", label: "Pendiente", count: 1, balance: 100_000, total: 100_000 },
      ]),
    );
    expectPng(png);
  });

  it("logs the error and substitutes a placeholder PNG when the render rejects, instead of throwing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const png = await safeChartPng(() => Promise.reject(new Error("boom")));

    expectPng(png);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("returns the SAME memoized placeholder PNG across multiple failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await safeChartPng(() => Promise.reject(new Error("boom 1")));
    const second = await safeChartPng(() => Promise.reject(new Error("boom 2")));

    expectPng(first);
    expectPng(second);
    expect(first.equals(second)).toBe(true);
  });
});
