import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { formatCOP } from "@/lib/money";
import { renderDashboardWorkbook, type DashboardChartImages, type DashboardExportData } from "@/lib/export/excel";

const SHEET_NAMES = [
  "Resumen",
  "Saldo por estado",
  "Mayores saldos",
  "Pagos por mes",
  "Facturas vencidas",
  "Pagos recientes",
  "Gastos por categoria",
  "Gastos recientes",
  "Graficos",
];

/** 1x1 transparent PNG — smallest valid PNG buffer, good enough for `addImage`'s extension detection. */
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
          notes: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    },
  };
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

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // `as any`: the project has multiple non-deduped `@types/node` versions on
  // disk (see exceljs's own nested `fast-csv` dependency), so the `Buffer`
  // type exceljs's own `.d.ts` expects isn't nominally the same as the one
  // this file's `Buffer.from` produces, even though both are the real Node
  // `Buffer` at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

describe("renderDashboardWorkbook", () => {
  it("builds one sheet per dashboard section, in order, with styled header rows", async () => {
    const buffer = await renderDashboardWorkbook(buildDashboardData(), buildChartImages());
    const workbook = await loadWorkbook(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEET_NAMES);

    const resumen = workbook.getWorksheet("Resumen")!;
    expect(resumen.getRow(1).values).toEqual([undefined, "Concepto", "Valor"]);
    expect(resumen.rowCount).toBe(5);
    expect(resumen.getRow(2).getCell(1).value).toBe("Saldo pendiente por cobrar");
    expect(resumen.getRow(2).getCell(2).value).toBe(formatCOP(500_000));
    expect(resumen.getRow(3).getCell(1).value).toBe("Pagado este mes");
    expect(resumen.getRow(3).getCell(2).value).toBe(formatCOP(200_000));
    expect(resumen.getRow(4).getCell(1).value).toBe("Facturas vencidas");
    expect(resumen.getRow(4).getCell(2).value).toBe(2);
    expect(resumen.getRow(5).getCell(1).value).toBe("Gastos del mes");
    expect(resumen.getRow(5).getCell(2).value).toBe(formatCOP(150_000));

    const saldoPorEstado = workbook.getWorksheet("Saldo por estado")!;
    expect(saldoPorEstado.getRow(1).values).toEqual([undefined, "Estado", "Cantidad", "Saldo", "Total"]);
    expect(saldoPorEstado.rowCount).toBe(5);
    expect(saldoPorEstado.getRow(2).values).toEqual([
      undefined,
      "Pendiente",
      2,
      formatCOP(300_000),
      formatCOP(400_000),
    ]);
    expect(saldoPorEstado.getRow(3).values).toEqual([
      undefined,
      "Parcial",
      1,
      formatCOP(50_000),
      formatCOP(100_000),
    ]);
    expect(saldoPorEstado.getRow(4).values).toEqual([undefined, "Pagada", 3, formatCOP(0), formatCOP(300_000)]);
    expect(saldoPorEstado.getRow(5).values).toEqual([
      undefined,
      "Vencida",
      1,
      formatCOP(100_000),
      formatCOP(100_000),
    ]);

    const mayoresSaldos = workbook.getWorksheet("Mayores saldos")!;
    expect(mayoresSaldos.getRow(1).values).toEqual([undefined, "Cliente", "Saldo"]);
    expect(mayoresSaldos.getRow(2).values).toEqual([undefined, "Cliente Uno", formatCOP(100_000)]);

    const pagosPorMes = workbook.getWorksheet("Pagos por mes")!;
    expect(pagosPorMes.getRow(1).values).toEqual([undefined, "Mes", "Monto"]);
    expect(pagosPorMes.rowCount).toBe(3);
    expect(pagosPorMes.getRow(2).values).toEqual([undefined, "jun", formatCOP(200_000)]);
    expect(pagosPorMes.getRow(3).values).toEqual([undefined, "jul", formatCOP(50_000)]);

    const facturasVencidas = workbook.getWorksheet("Facturas vencidas")!;
    expect(facturasVencidas.getRow(1).values).toEqual([
      undefined,
      "Numero",
      "Fecha",
      "Vencimiento",
      "Total",
      "Pagado",
      "Saldo",
      "Estado",
    ]);
    expect(facturasVencidas.rowCount).toBe(3);
    expect(facturasVencidas.getRow(2).values).toEqual([
      undefined,
      "F-001",
      "2026-06-01",
      "2026-06-15",
      formatCOP(100_000),
      formatCOP(0),
      formatCOP(100_000),
      "Vencida",
    ]);
    // Second invoice's `dueDate` is `null` — exercises the `?? "-"` fallback.
    expect(facturasVencidas.getRow(3).values).toEqual([
      undefined,
      "F-002",
      "2026-05-01",
      "-",
      formatCOP(50_000),
      formatCOP(20_000),
      formatCOP(30_000),
      "Vencida",
    ]);

    const pagosRecientes = workbook.getWorksheet("Pagos recientes")!;
    expect(pagosRecientes.getRow(1).values).toEqual([
      undefined,
      "Fecha",
      "Cliente",
      "Factura",
      "Monto",
      "Metodo",
      "Notas",
    ]);
    expect(pagosRecientes.rowCount).toBe(3);
    // First payment's `notes` is `null` — exercises the `?? "-"` fallback.
    expect(pagosRecientes.getRow(2).values).toEqual([
      undefined,
      "2026-07-01",
      "Cliente Uno",
      "F-001",
      formatCOP(50_000),
      "transferencia",
      "-",
    ]);
    // Second payment's `method` is `null` — exercises the `?? "-"` fallback.
    expect(pagosRecientes.getRow(3).values).toEqual([
      undefined,
      "2026-06-20",
      "Cliente Dos",
      "F-002",
      formatCOP(20_000),
      "-",
      "Pago parcial",
    ]);

    const gastosPorCategoria = workbook.getWorksheet("Gastos por categoria")!;
    expect(gastosPorCategoria.getRow(1).values).toEqual([undefined, "Categoria", "Total"]);
    expect(gastosPorCategoria.getRow(2).values).toEqual([undefined, "Nómina", formatCOP(100_000)]);
    expect(gastosPorCategoria.getRow(3).values).toEqual([undefined, "Otro", formatCOP(50_000)]);

    const gastosRecientes = workbook.getWorksheet("Gastos recientes")!;
    expect(gastosRecientes.getRow(1).values).toEqual([
      undefined,
      "Fecha",
      "Categoria",
      "Descripcion",
      "Monto",
      "Notas",
    ]);
    // `notes` is `null` — exercises the `?? "-"` fallback.
    expect(gastosRecientes.getRow(2).values).toEqual([
      undefined,
      "2026-07-01",
      "Nómina",
      "Pago de nomina",
      formatCOP(100_000),
      "-",
    ]);
  });

  it("does not include a Cliente column on Facturas vencidas", async () => {
    const buffer = await renderDashboardWorkbook(buildDashboardData(), buildChartImages());
    const workbook = await loadWorkbook(buffer);
    const facturasVencidas = workbook.getWorksheet("Facturas vencidas")!;

    const headerValues = (facturasVencidas.getRow(1).values as unknown[]).filter((value) => value !== undefined);
    expect(headerValues).not.toContain("Cliente");
  });

  it("embeds all 5 chart PNGs into the Graficos sheet, without altering the 8 data sheets", async () => {
    const buffer = await renderDashboardWorkbook(buildDashboardData(), buildChartImages());
    const workbook = await loadWorkbook(buffer);

    const graficos = workbook.getWorksheet("Graficos")!;
    expect(graficos).toBeDefined();

    // `workbook.model.media` holds every embedded image across the whole
    // workbook — 5 chart PNGs, one per `DashboardChartImages` key.
    expect(workbook.model.media.length).toBe(5);
    for (const media of workbook.model.media) {
      expect(media.type).toBe("image");
      expect(media.extension).toBe("png");
    }

    // The 8 pre-existing data sheets are untouched.
    const dataSheetNames = SHEET_NAMES.filter((name) => name !== "Graficos");
    expect(dataSheetNames.every((name) => workbook.getWorksheet(name) !== undefined)).toBe(true);
    expect(workbook.getWorksheet("Resumen")!.rowCount).toBe(5);
  });

  it("renders header-only sheets for an empty-state business without throwing", async () => {
    const buffer = await renderDashboardWorkbook(buildEmptyDashboardData(), buildChartImages());
    const workbook = await loadWorkbook(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEET_NAMES);

    // Fixed-order sheets still emit their fixed rows, rendering `formatCOP(0)` for every money cell.
    const saldoPorEstado = workbook.getWorksheet("Saldo por estado")!;
    expect(saldoPorEstado.rowCount).toBe(5);
    expect(saldoPorEstado.getRow(2).values).toEqual([undefined, "Pendiente", 0, formatCOP(0), formatCOP(0)]);
    expect(saldoPorEstado.getRow(5).values).toEqual([undefined, "Vencida", 0, formatCOP(0), formatCOP(0)]);

    const gastosPorCategoria = workbook.getWorksheet("Gastos por categoria")!;
    expect(gastosPorCategoria.rowCount).toBe(3);
    expect(gastosPorCategoria.getRow(2).values).toEqual([undefined, "Nómina", formatCOP(0)]);
    expect(gastosPorCategoria.getRow(3).values).toEqual([undefined, "Otro", formatCOP(0)]);

    // List-driven sheets are header-only.
    const mayoresSaldos = workbook.getWorksheet("Mayores saldos")!;
    expect(mayoresSaldos.rowCount).toBe(1);
    const facturasVencidas = workbook.getWorksheet("Facturas vencidas")!;
    expect(facturasVencidas.rowCount).toBe(1);
    const pagosRecientes = workbook.getWorksheet("Pagos recientes")!;
    expect(pagosRecientes.rowCount).toBe(1);
    const gastosRecientes = workbook.getWorksheet("Gastos recientes")!;
    expect(gastosRecientes.rowCount).toBe(1);
    const pagosPorMes = workbook.getWorksheet("Pagos por mes")!;
    expect(pagosPorMes.rowCount).toBe(1);

    const resumen = workbook.getWorksheet("Resumen")!;
    expect(resumen.rowCount).toBe(5);
    expect(resumen.getRow(2).getCell(2).value).toBe(formatCOP(0));
    expect(resumen.getRow(3).getCell(2).value).toBe(formatCOP(0));
    expect(resumen.getRow(4).getCell(2).value).toBe(0);
    expect(resumen.getRow(5).getCell(2).value).toBe(formatCOP(0));
  });
});
