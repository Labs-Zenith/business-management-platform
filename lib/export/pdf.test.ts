import PDFDocument from "pdfkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCOP } from "@/lib/money";
import { renderDashboardExportPdf, renderInvoicePdf, renderInvoicesExportPdf, renderPaymentsExportPdf } from "@/lib/export/pdf";
import type { DashboardChartImages, DashboardExportData, InvoiceExportRow } from "@/lib/export/excel";
import type { Business, InvoiceDetail, InvoiceWithFinance, PaymentWithRefs } from "@/lib/services/ports";

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
    periodLabel: "Julio 2026",
    summary: {
      pendingBalance: 500_000,
      paidThisMonth: 200_000,
      overdueInvoices: 2,
      overdueInvoiceList: [
        {
          id: "inv-1",
          businessId: "biz-1",
          customerId: "cust-1",
          invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
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
          invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
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
          methodId: "c3000000-0000-4000-8000-000000000002",
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
          methodId: null,
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
          categoryId: "c2000000-0000-4000-8000-000000000001",
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
    invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
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
    periodLabel: "Julio 2026",
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

function buildBusiness(): Business {
  return {
    id: "biz-1",
    name: "Negocio de Prueba",
    email: "negocio@example.com",
    phone: "555-0100",
    address: "Calle Falsa 123",
    currency: "COP",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildInvoiceDetail(): InvoiceDetail {
  return {
    id: "inv-1",
    businessId: "biz-1",
    customerId: "cust-1",
    invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
    number: "F-0001",
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    subtotal: 100_000,
    total: 100_000,
    status: "pending",
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    paidAmount: 0,
    balance: 100_000,
    customer: {
      id: "cust-1",
      businessId: "biz-1",
      name: "Cliente de Prueba",
      documentNumber: null,
      email: null,
      phone: null,
      address: null,
      notes: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    items: [
      { id: "item-1", invoiceId: "inv-1", description: "Producto de prueba", quantity: 1, unitPrice: 100_000, productId: null, lineTotal: 100_000 },
    ],
    payments: [],
  };
}

function buildInvoiceExportRows(): InvoiceExportRow[] {
  return [
    {
      id: "inv-1",
      businessId: "biz-1",
      customerId: "cust-1",
      invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
      number: "F-0001",
      issueDate: "2026-07-01",
      dueDate: "2026-07-15",
      subtotal: 100_000,
      total: 100_000,
      status: "pending",
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      paidAmount: 0,
      balance: 100_000,
      customerName: "Cliente de Prueba",
    },
  ];
}

function buildPaymentRows(): PaymentWithRefs[] {
  return [
    {
      id: "pay-1",
      businessId: "biz-1",
      invoiceId: "inv-1",
      customerId: "cust-1",
      paymentDate: "2026-07-01",
      amount: 50_000,
      method: "efectivo",
      methodId: null,
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      customer: { id: "cust-1", name: "Cliente de Prueba" },
      invoice: { id: "inv-1", number: "F-0001" },
    },
  ];
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
      "Gastos por categoría",
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
      // Once, as its section heading: the Resumen row now reads "Facturas
      // vencidas (a hoy)", which is a different string.
      "Facturas vencidas": 1,
      "Pagos recientes": 1,
      "Gastos por categoría": 1,
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

    // 1. Resumen — names the exported period, then the two point-in-time
    // "(a hoy)" figures, then the two that follow the period. Includes a
    // plain count row (not currency-formatted) alongside the money rows.
    expect(rendered).toContain("Periodo");
    expect(rendered).toContain("Julio 2026");
    expect(rendered).toContain("Por cobrar (al momento de exportar)");
    expect(rendered).toContain(formatCOP(500_000));
    expect(rendered).toContain("Facturas vencidas (al momento de exportar)");
    expect(rendered).toContain("2");
    expect(rendered).toContain("Pagado — Julio 2026");
    expect(rendered).toContain(formatCOP(200_000));
    expect(rendered).toContain("Gastos — Julio 2026");
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

    // 45 rows, each at `writeTable`'s 22pt row-height floor (none of these
    // fixture values are long enough to wrap and grow past it) — ~990pt
    // total — is far taller than landscape A4's usable height (~515.28pt
    // after margins; smaller than portrait's ~761.89pt because width and
    // height swap under `layout: "landscape"`), so `ensureRoom` must have
    // triggered at least one page break inside this table.
    expect(addPageSpy).toHaveBeenCalled();

    const allHeadings = [
      "Resumen",
      "Saldo por estado",
      "Mayores saldos",
      "Pagos por mes",
      "Facturas vencidas",
      "Pagos recientes",
      "Gastos por categoría",
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

    // `writeTable`'s header row ("Número"/"Estado", etc.) must repeat once
    // the table continues onto a new page.
    expect(facturasVencidasSlice.filter((value) => value === "Número").length).toBeGreaterThanOrEqual(2);
    expect(facturasVencidasSlice.filter((value) => value === "Estado").length).toBeGreaterThanOrEqual(2);

    // The last row's data must still have rendered after the page break.
    expect(facturasVencidasSlice).toContain("F-0045");
  });
});

/**
 * `writeTable`'s header band draws its shaded background via a single
 * `doc.rect(startX, y, tableWidth, headerHeight)` call per table (repeated
 * once per page the table spans, on header repeat) — the one place the
 * table's total column width is passed to pdfkit as a real number. Spying
 * on `rect` (rather than re-deriving column widths from spied `text` calls)
 * gives a direct, real geometry assertion instead of a restatement of the
 * column-width literals already in `pdf.ts`.
 */
function captureTableWidths(): { entries: () => { tableWidth: number; contentWidth: number }[] } {
  const entries: { tableWidth: number; contentWidth: number }[] = [];
  vi.spyOn(PDFDocument.prototype, "rect").mockImplementation(function (this: PDFKit.PDFDocument, ...args: unknown[]) {
    const w = args[2] as number;
    entries.push({
      tableWidth: w,
      contentWidth: this.page.width - this.page.margins.left - this.page.margins.right,
    });
    return this;
  });
  return { entries: () => entries };
}

describe("table geometry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Regression test for the horizontal-overflow half of the bug: before this
   * fix, `renderInvoicesExportPdf`'s columns summed to 640pt and
   * `renderPaymentsExportPdf`'s to 600pt against a portrait page's 515.28pt
   * content width — both silently clipped or dropped columns off the page
   * edge, and nothing in this file asserted on width/position at all. This
   * exercises every exporter (the portrait customer-facing invoice included)
   * and asserts the real invariant `writeTable` never checked itself:
   * `Σ column.width <= contentWidth(doc)`, for that document's own layout.
   */
  it("keeps every rendered table's total column width within its own page's content width", async () => {
    const { entries } = captureTableWidths();

    await renderInvoicePdf(buildBusiness(), buildInvoiceDetail());
    await renderInvoicesExportPdf(buildInvoiceExportRows());
    await renderPaymentsExportPdf(buildPaymentRows());
    await renderDashboardExportPdf(buildDashboardData(), buildChartImages());

    const captured = entries();
    // Sanity: every render above draws at least one table, so this must be
    // non-empty — otherwise the assertion below would vacuously pass.
    expect(captured.length).toBeGreaterThan(0);
    for (const { tableWidth, contentWidth } of captured) {
      expect(tableWidth).toBeLessThanOrEqual(contentWidth);
    }
  });

  /**
   * Regression test for the vertical-overlap half of the bug: `writeTable`
   * used to advance `doc.y` by a hardcoded 22pt per row regardless of how
   * tall the cell text actually rendered, so a wrapped multi-line cell (e.g.
   * a long customer name in the "Cliente" column) bled into the next row.
   * This renders a real long value through `renderPaymentsExportPdf`,
   * captures the exact `(value, x, y)` pdfkit drew each cell at, and asserts
   * the following row starts below where the wrapped cell's text actually
   * ends — not merely that some row height increased.
   */
  it("does not let a long wrapped cell value overlap the following row", async () => {
    const longCustomerName =
      "Comercializadora Internacional de Suministros Industriales y Servicios Unidos S.A.S.";
    const rows: PaymentWithRefs[] = [
      {
        id: "pay-1",
        businessId: "biz-1",
        invoiceId: "inv-1",
        customerId: "cust-1",
        paymentDate: "2026-07-01",
        amount: 50_000,
        method: "efectivo",
        methodId: null,
        notes: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        customer: { id: "cust-1", name: longCustomerName },
        invoice: { id: "inv-1", number: "F-0001" },
      },
      {
        id: "pay-2",
        businessId: "biz-1",
        invoiceId: "inv-2",
        customerId: "cust-2",
        paymentDate: "2026-07-02",
        amount: 20_000,
        method: "efectivo",
        methodId: null,
        notes: null,
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        customer: { id: "cust-2", name: "Cliente Normal" },
        invoice: { id: "inv-2", number: "F-0002" },
      },
    ];

    const positioned: { value: string; y: number }[] = [];
    const originalText = PDFDocument.prototype.text;
    vi.spyOn(PDFDocument.prototype, "text").mockImplementation(function (this: PDFKit.PDFDocument, ...args: unknown[]) {
      const [value, x, y] = args as [string, number | undefined, number | undefined, unknown?];
      if (typeof x === "number" && typeof y === "number") {
        positioned.push({ value, y });
      }
      return originalText.apply(this, args as Parameters<typeof originalText>);
    });

    await renderPaymentsExportPdf(rows);

    const longNameCall = positioned.find((call) => call.value === longCustomerName);
    // The row after the wrapped "Cliente" cell — identified by its own
    // "Fecha" cell value, which is only ever drawn once, so this can't
    // accidentally match the wrapped row itself or a header repeat.
    const nextRowCall = positioned.find((call) => call.value === "2026-07-02");
    expect(longNameCall).toBeDefined();
    expect(nextRowCall).toBeDefined();

    // Measure with a real (unmocked) document using the exact font/size and
    // "Cliente" column width `renderPaymentsExportPdf` renders with (200pt,
    // minus the 8pt of horizontal cell padding `writeTable` reserves).
    const measureDoc = new PDFDocument({ size: "A4", margin: 40, layout: "landscape" });
    measureDoc.font("Helvetica").fontSize(8);
    const wrappedHeight = measureDoc.heightOfString(longCustomerName, { width: 200 - 8 });

    // Confirms this value actually exercises wrapping (more than one 8pt
    // Helvetica line, ~9.25pt) — otherwise the assertion below would pass
    // trivially without ever having tested the overlap-prone path.
    expect(wrappedHeight).toBeGreaterThan(9.5);

    // The text baseline every cell is drawn at is `y + 7` from the row's
    // top; the wrapped cell's rendered text therefore ends at
    // `longNameCall.y + wrappedHeight`. The next row must start no earlier
    // than that.
    expect(nextRowCall!.y).toBeGreaterThan(longNameCall!.y + wrappedHeight);
  });
});
