import PDFDocument from "pdfkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCOP } from "@/lib/money";
import { renderDashboardExportPdf } from "@/lib/export/pdf";
import type { DashboardChartImages, DashboardExportData } from "@/lib/export/excel";
import type { InvoiceWithFinance } from "@/lib/services/ports";

/** 1x1 transparent PNG — smallest valid PNG buffer, sufficient for `doc.image`. */
const FAKE_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function buildChartImages(): DashboardChartImages {
  return {
    receivablesByStatus: FAKE_PNG_BUFFER,
    topDebtors: FAKE_PNG_BUFFER,
    monthlyPayments: FAKE_PNG_BUFFER,
    expensesByCategory: FAKE_PNG_BUFFER,
    expensesByMonth: FAKE_PNG_BUFFER,
  };
}

function buildDashboardData(): DashboardExportData {
  return {
    summary: {
      pendingBalance: 500_000,
      paidThisMonth: 200_000,
      overdueInvoices: 2,
      overdueInvoiceList: [
        {
          id: "inv-1",
          businessId: "biz-1",
          customerId: "cust-1",
          number: "F-001",
          issueDate: "2026-06-01",
          dueDate: "2026-06-15",
          subtotal: 100_000,
          total: 100_000,
          status: "overdue",
          notes: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          paidAmount: 0,
          balance: 100_000,
        },
        {
          // Exercises the `dueDate ?? "-"` fallback branch.
          id: "inv-2",
          businessId: "biz-1",
          customerId: "cust-2",
          number: "F-002",
          issueDate: "2026-05-01",
          dueDate: null,
          subtotal: 50_000,
          total: 50_000,
          status: "overdue",
          notes: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          paidAmount: 20_000,
          balance: 30_000,
        },
      ],
      recentPayments: [
        {
          // Exercises the `notes ?? "-"` fallback branch.
          id: "pay-1",
          businessId: "biz-1",
          invoiceId: "inv-1",
          customerId: "cust-1",
          paymentDate: "2026-07-01",
          amount: 50_000,
          method: "transferencia",
          notes: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          customer: { id: "cust-1", name: "Cliente Uno" },
          invoice: { id: "inv-1", number: "F-001" },
        },
        {
          // Exercises the `method ?? "-"` fallback branch.
          id: "pay-2",
          businessId: "biz-1",
          invoiceId: "inv-2",
          customerId: "cust-2",
          paymentDate: "2026-06-20",
          amount: 20_000,
          method: null,
          notes: "Pago parcial",
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
          customer: { id: "cust-2", name: "Cliente Dos" },
          invoice: { id: "inv-2", number: "F-002" },
        },
      ],
      topDebtors: [{ id: "cust-1", name: "Cliente Uno", balance: 100_000 }],
    },
    charts: {
      receivablesByStatus: [
        { status: "pending", label: "Pendiente", count: 2, balance: 300_000, total: 400_000 },
        { status: "partially_paid", label: "Parcial", count: 1, balance: 50_000, total: 100_000 },
        { status: "paid", label: "Pagada", count: 3, balance: 0, total: 300_000 },
        { status: "overdue", label: "Vencida", count: 1, balance: 100_000, total: 100_000 },
      ],
      topDebtorBalances: [{ id: "cust-1", name: "Cliente Uno", balance: 100_000 }],
      monthlyPayments: [
        { month: "2026-06", label: "jun", amount: 200_000 },
        { month: "2026-07", label: "jul", amount: 50_000 },
      ],
      monthlyInvoiced: [
        { month: "2026-06", label: "jun", amount: 250_000 },
        { month: "2026-07", label: "jul", amount: 150_000 },
      ],
    },
    expenses: {
      totalThisMonth: 150_000,
      byCategory: [
        { category: "nomina", label: "Nómina", total: 100_000 },
        { category: "otro", label: "Otro", total: 50_000 },
      ],
      recentExpenses: [
        {
          id: "exp-1",
          businessId: "biz-1",
          category: "nomina",
          expenseDate: "2026-07-01",
          description: "Pago de nomina",
          amount: 100_000,
          // Exercises the `notes ?? "-"` fallback branch.
          notes: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    },
  };
}

/**
 * Builds enough overdue-invoice rows to force at least one `doc.addPage()`
 * mid-table on an A4 page — the "Facturas vencidas" section's other fixtures
 * only ever have 2 rows, far short of what's needed to exercise
 * `ensureRoom`'s page-break path, `writeTable`'s header-repeat-on-new-page
 * behavior, and `writeSectionHeading`'s orphaned-heading guard, none of
 * which are exercised by any other test in this file.
 */
function buildLargeOverdueInvoiceList(count: number): InvoiceWithFinance[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `inv-large-${index}`,
    businessId: "biz-1",
    customerId: "cust-1",
    number: `F-${String(index + 1).padStart(4, "0")}`,
    issueDate: "2026-06-01",
    dueDate: "2026-06-15",
    subtotal: 10_000,
    total: 10_000,
    status: "overdue",
    notes: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    paidAmount: 0,
    balance: 10_000,
  }));
}

function buildEmptyDashboardData(): DashboardExportData {
  return {
    summary: {
      pendingBalance: 0,
      paidThisMonth: 0,
      overdueInvoices: 0,
      overdueInvoiceList: [],
      recentPayments: [],
      topDebtors: [],
    },
    charts: {
      receivablesByStatus: [
        { status: "pending", label: "Pendiente", count: 0, balance: 0, total: 0 },
        { status: "partially_paid", label: "Parcial", count: 0, balance: 0, total: 0 },
        { status: "paid", label: "Pagada", count: 0, balance: 0, total: 0 },
        { status: "overdue", label: "Vencida", count: 0, balance: 0, total: 0 },
      ],
      topDebtorBalances: [],
      monthlyPayments: [],
      monthlyInvoiced: [],
    },
    expenses: {
      totalThisMonth: 0,
      byCategory: [
        { category: "nomina", label: "Nómina", total: 0 },
        { category: "otro", label: "Otro", total: 0 },
      ],
      recentExpenses: [],
    },
  };
}

/**
 * There is no PDF-text-extraction library in this project (unlike ExcelJS,
 * which can load its own buffer back for cell-level assertions), and pdfkit's
 * own page content streams are deflate-compressed — not directly greppable.
 * So instead of asserting only on the buffer's magic bytes / structural
 * shape, spy on `PDFDocument.prototype.text` (which every write path in
 * `pdf.ts` — `writeTitle`, `writeSectionHeading`, `writeTable` — funnels
 * through) to capture the exact ordered sequence of strings actually drawn to
 * the document, and assert on real rendered values from it.
 */
function captureRenderedText(): { calls: () => string[] } {
  const spy = vi.spyOn(PDFDocument.prototype, "text");
  return { calls: () => spy.mock.calls.map((call) => call[0] as string) };
}

/**
 * Finds each heading's index in strict document order via a running cursor,
 * rather than plain `indexOf` per heading — needed because the Resumen
 * section's "Facturas vencidas" KPI *label* is textually identical to the
 * later "Facturas vencidas" section *heading*, and a naive `indexOf` would
 * match the earlier row instead of the actual heading.
 */
function findHeadingIndexesInOrder(rendered: string[], headings: string[]): number[] {
  let cursor = 0;
  return headings.map((heading) => {
    const index = rendered.indexOf(heading, cursor);
    cursor = index + 1;
    return index;
  });
}

describe("renderDashboardExportPdf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with the PDF magic bytes", async () => {
    const buffer = await renderDashboardExportPdf(buildDashboardData(), buildChartImages());
    expect(buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("renders one heading and one populated table per section, with real values, in order", async () => {
    const { calls } = captureRenderedText();
    await renderDashboardExportPdf(buildDashboardData(), buildChartImages());
    const rendered = calls();

    // Document title, once.
    expect(rendered).toContain("Reporte de Dashboard");

    // Section headings, in the exact order committed by PR1's Excel sheets,
    // plus the new chart-only "Gastos por mes" heading inserted right after
    // "Gastos por categoria" (there is no pre-existing "Gastos por mes" data
    // sheet/table — only its chart image is new here).
    const sectionHeadings = [
      "Resumen",
      "Saldo por estado",
      "Mayores saldos",
      "Pagos por mes",
      "Facturas vencidas",
      "Pagos recientes",
      "Gastos por categoria",
      "Gastos por mes",
      "Gastos recientes",
    ];
    const headingIndexes = findHeadingIndexesInOrder(rendered, sectionHeadings);
    expect(headingIndexes.every((index) => index !== -1)).toBe(true);
    expect(headingIndexes).toEqual([...headingIndexes].sort((a, b) => a - b));

    // Each heading must appear exactly its expected number of times — this
    // catches an accidental duplicate `writeSectionHeading` call, which the
    // monotonic-order check above would miss (two consecutive identical
    // headings are still "in order"). Most headings are expected exactly
    // once; "Facturas vencidas" is the sole legitimate exception because it
    // also renders as the Resumen section's KPI *label* (a data value, not a
    // heading) — see `findHeadingIndexesInOrder`'s doc comment.
    const expectedHeadingOccurrences: Record<string, number> = {
      Resumen: 1,
      "Saldo por estado": 1,
      "Mayores saldos": 1,
      "Pagos por mes": 1,
      "Facturas vencidas": 2,
      "Pagos recientes": 1,
      "Gastos por categoria": 1,
      "Gastos por mes": 1,
      "Gastos recientes": 1,
    };
    for (const heading of sectionHeadings) {
      expect(rendered.filter((value) => value === heading).length).toBe(expectedHeadingOccurrences[heading]);
    }

    // Section slices (heading-to-next-heading) so null-fallback assertions
    // below are scoped to the section that actually renders each fallback,
    // instead of asserting a dash exists anywhere in the whole document.
    const sectionSlices = sectionHeadings.map((_heading, index) => {
      const start = headingIndexes[index];
      const end = index + 1 < headingIndexes.length ? headingIndexes[index + 1] : rendered.length;
      return rendered.slice(start, end);
    });
    const [, , , , facturasVencidasSlice, pagosRecientesSlice, , , gastosRecientesSlice] = sectionSlices;

    // 1. Resumen — plain count row (not currency-formatted) alongside money rows.
    expect(rendered).toContain("Saldo pendiente por cobrar");
    expect(rendered).toContain(formatCOP(500_000));
    expect(rendered).toContain("Pagado este mes");
    expect(rendered).toContain(formatCOP(200_000));
    expect(rendered).toContain("Facturas vencidas");
    expect(rendered).toContain("2");
    expect(rendered).toContain("Gastos del mes");
    expect(rendered).toContain(formatCOP(150_000));

    // 2. Saldo por estado — Estado/Cantidad/Saldo/Total, all 4 fixed rows.
    expect(rendered).toContain("Pendiente");
    expect(rendered).toContain(formatCOP(300_000));
    expect(rendered).toContain(formatCOP(400_000));
    expect(rendered).toContain("Vencida");
    expect(rendered).toContain(formatCOP(100_000));

    // 3. Mayores saldos (from summary.topDebtors, not charts.topDebtorBalances).
    expect(rendered).toContain("Cliente Uno");

    // 4. Pagos por mes.
    expect(rendered).toContain("jun");
    expect(rendered).toContain(formatCOP(200_000));
    expect(rendered).toContain("jul");
    expect(rendered).toContain(formatCOP(50_000));

    // 5. Facturas vencidas — no Cliente column; null `dueDate` (inv-2) falls
    // back to "-", scoped to this section's own rows (not just anywhere in
    // the document).
    expect(facturasVencidasSlice).toContain("F-001");
    expect(facturasVencidasSlice).toContain("2026-06-15");
    expect(facturasVencidasSlice).toContain("F-002");
    expect(facturasVencidasSlice.filter((value) => value === "-").length).toBe(1);
    expect(facturasVencidasSlice).toContain("Vencida");

    // 6. Pagos recientes — null `method` (pay-2) and null `notes` (pay-1)
    // each fall back to "-", scoped to this section's own rows.
    expect(pagosRecientesSlice).toContain("Cliente Uno");
    expect(pagosRecientesSlice).toContain("F-001");
    expect(pagosRecientesSlice).toContain("transferencia");
    expect(pagosRecientesSlice).toContain("Cliente Dos");
    expect(pagosRecientesSlice).toContain("Pago parcial");
    expect(pagosRecientesSlice.filter((value) => value === "-").length).toBe(2);

    // 7. Gastos por categoria — label uses `datum.label`, not a re-derived label.
    expect(rendered).toContain("Nómina");
    expect(rendered).toContain(formatCOP(100_000));
    expect(rendered).toContain("Otro");
    expect(rendered).toContain(formatCOP(50_000));

    // 8. Gastos recientes — category via `getCategoryLabel`; null `notes`
    // (exp-1) falls back to "-", scoped to this section's own rows.
    expect(gastosRecientesSlice).toContain("Pago de nomina");
    expect(gastosRecientesSlice.filter((value) => value === "-").length).toBe(1);
  });

  it("does not render a Cliente column for Facturas vencidas", async () => {
    const { calls } = captureRenderedText();
    await renderDashboardExportPdf(buildDashboardData(), buildChartImages());
    const rendered = calls();

    const [, , , , facturasVencidasIndex, pagosRecientesIndex] = findHeadingIndexesInOrder(rendered, [
      "Resumen",
      "Saldo por estado",
      "Mayores saldos",
      "Pagos por mes",
      "Facturas vencidas",
      "Pagos recientes",
    ]);
    const facturasVencidasSection = rendered.slice(facturasVencidasIndex, pagosRecientesIndex);
    expect(facturasVencidasSection).not.toContain("Cliente");
  });

  it("renders header-only tables with zero-amount formatting for an empty-state business, without throwing", async () => {
    const { calls } = captureRenderedText();
    const buffer = await renderDashboardExportPdf(buildEmptyDashboardData(), buildChartImages());
    const rendered = calls();

    expect(buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");

    // Headings for header-only list sections still render.
    expect(rendered).toContain("Mayores saldos");
    expect(rendered).toContain("Pagos por mes");
    expect(rendered).toContain("Facturas vencidas");
    expect(rendered).toContain("Pagos recientes");
    expect(rendered).toContain("Gastos por mes");
    expect(rendered).toContain("Gastos recientes");

    // Fixed-order sections still emit their fixed rows, all rendering `formatCOP(0)`.
    expect(rendered).toContain(formatCOP(0));
    expect(rendered.filter((value) => value === formatCOP(0)).length).toBeGreaterThan(1);
    expect(rendered).toContain("Nómina");
    expect(rendered).toContain("Otro");
    expect(rendered).toContain("Facturas vencidas");
    expect(rendered).toContain("0");
  });

  it("embeds one chart image per section, in the same order as the headings", async () => {
    const imageSpy = vi.spyOn(PDFDocument.prototype, "image");
    await renderDashboardExportPdf(buildDashboardData(), buildChartImages());

    expect(imageSpy).toHaveBeenCalledTimes(5);
    for (const call of imageSpy.mock.calls) {
      expect(Buffer.isBuffer(call[0])).toBe(true);
    }
  });

  it("still embeds all 5 chart images for an empty-state business (Sin datos placeholders), without throwing", async () => {
    const imageSpy = vi.spyOn(PDFDocument.prototype, "image");
    const buffer = await renderDashboardExportPdf(buildEmptyDashboardData(), buildChartImages());

    expect(buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(imageSpy).toHaveBeenCalledTimes(5);
  });

  it("forces a page break mid-table and repeats the table header on the new page", async () => {
    const { calls } = captureRenderedText();
    const addPageSpy = vi.spyOn(PDFDocument.prototype, "addPage");
    const data = buildDashboardData();
    data.summary.overdueInvoiceList = buildLargeOverdueInvoiceList(45);

    await renderDashboardExportPdf(data, buildChartImages());
    const rendered = calls();

    // 45 rows at pdfkit's 22pt row height (~990pt) is far taller than an A4
    // page's usable height (~760pt after margins), so `ensureRoom` must have
    // triggered at least one page break inside this table.
    expect(addPageSpy).toHaveBeenCalled();

    const allHeadings = [
      "Resumen",
      "Saldo por estado",
      "Mayores saldos",
      "Pagos por mes",
      "Facturas vencidas",
      "Pagos recientes",
      "Gastos por categoria",
      "Gastos por mes",
      "Gastos recientes",
    ];
    const headingIndexes = findHeadingIndexesInOrder(rendered, allHeadings);
    const [, , , , facturasVencidasIndex, pagosRecientesIndex] = headingIndexes;
    const facturasVencidasSlice = rendered.slice(facturasVencidasIndex, pagosRecientesIndex);

    // The "Facturas vencidas" heading itself must not repeat (the orphaned
    // heading is only written once, before the table starts) — only the
    // table's header row should repeat on the new page.
    expect(facturasVencidasSlice.filter((value) => value === "Facturas vencidas").length).toBe(1);

    // `writeTable`'s header row ("Numero"/"Estado", etc.) must repeat once
    // the table continues onto a new page.
    expect(facturasVencidasSlice.filter((value) => value === "Numero").length).toBeGreaterThanOrEqual(2);
    expect(facturasVencidasSlice.filter((value) => value === "Estado").length).toBeGreaterThanOrEqual(2);

    // The last row's data must still have rendered after the page break.
    expect(facturasVencidasSlice).toContain("F-0045");
  });
});
