import { describe, expect, it } from "vitest";
import { CHART_COLORS, renderBarChartSvg } from "@/lib/export/chart-svg";
import { formatCOP } from "@/lib/money";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("renderBarChartSvg", () => {
  it("renders the title, one <rect> per non-zero bar, and formatted value labels", () => {
    const svg = renderBarChartSvg({
      title: "Saldo por estado",
      data: [
        { label: "Pendiente", value: 300_000 },
        { label: "Parcial", value: 50_000 },
        { label: "Pagada", value: 0 },
        { label: "Vencida", value: 100_000 },
      ],
      valueFormatter: formatCOP,
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain("Saldo por estado");
    expect(countOccurrences(svg, "<rect")).toBe(1 + 3); // background rect + 3 non-zero bars
    expect(svg).toContain("Pendiente");
    expect(svg).toContain("Parcial");
    expect(svg).toContain("Pagada");
    expect(svg).toContain("Vencida");
    expect(svg).toContain(formatCOP(300_000));
    expect(svg).toContain(formatCOP(50_000));
    expect(svg).toContain(formatCOP(100_000));
    expect(svg).not.toContain("Sin datos");
  });

  it("cycles through the default palette when no per-bar color is given", () => {
    const svg = renderBarChartSvg({
      title: "Gastos por categoria",
      data: [
        { label: "Nomina", value: 100 },
        { label: "Otro", value: 50 },
      ],
    });

    expect(svg).toContain(CHART_COLORS.chart1);
    expect(svg).toContain(CHART_COLORS.chart2);
  });

  it("uses a single explicit color for every bar when provided", () => {
    const svg = renderBarChartSvg({
      title: "Pagos por mes",
      data: [
        { label: "jun", value: 200_000, color: CHART_COLORS.chart2 },
        { label: "jul", value: 50_000, color: CHART_COLORS.chart2 },
      ],
      valueFormatter: formatCOP,
    });

    expect(countOccurrences(svg, `fill="${CHART_COLORS.chart2}"`)).toBe(2);
    expect(svg).not.toContain(CHART_COLORS.chart3);
  });

  it("renders category labels in horizontal orientation, truncating ones that exceed the max length", () => {
    const svg = renderBarChartSvg({
      title: "Mayores saldos",
      data: [
        { label: "Cliente Con Nombre Muy Largo S.A.S.", value: 500_000 },
        { label: "Otro Cliente", value: 250_000 },
      ],
      orientation: "horizontal",
      valueFormatter: formatCOP,
    });

    // First label exceeds the max length (see the dedicated truncation test
    // below) and is truncated with an ellipsis; the second, shorter label is
    // rendered in full.
    expect(svg).not.toContain("Cliente Con Nombre Muy Largo S.A.S.");
    expect(svg).toContain("Cliente Con Nombre…");
    expect(svg).toContain("Otro Cliente");
    expect(countOccurrences(svg, "<rect")).toBe(1 + 2);
  });

  it("renders the empty-state placeholder instead of dividing by zero, for an empty array", () => {
    const svg = renderBarChartSvg({ title: "Gastos por mes", data: [] });

    expect(svg).toContain("Gastos por mes");
    expect(svg).toContain("Sin datos");
    expect(countOccurrences(svg, "<rect")).toBe(1); // background only, no bars
  });

  it("renders the empty-state placeholder when every value is zero", () => {
    const svg = renderBarChartSvg({
      title: "Gastos por mes",
      data: [
        { label: "jun", value: 0 },
        { label: "jul", value: 0 },
      ],
    });

    expect(svg).toContain("Sin datos");
    expect(countOccurrences(svg, "<rect")).toBe(1);
  });

  it("never emits NaN or Infinity, across normal, empty, all-zero, NaN, and Infinity inputs", () => {
    const cases = [
      renderBarChartSvg({ title: "A", data: [] }),
      renderBarChartSvg({ title: "B", data: [{ label: "x", value: 0 }] }),
      renderBarChartSvg({ title: "C", data: [{ label: "x", value: 100 }] }),
      renderBarChartSvg({
        title: "D",
        data: [{ label: "x", value: 100 }],
        orientation: "horizontal",
      }),
      renderBarChartSvg({ title: "E", data: [{ label: "x", value: NaN }] }),
      renderBarChartSvg({ title: "F", data: [{ label: "x", value: Infinity }] }),
    ];
    for (const svg of cases) {
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    }

    // A lone NaN (or Infinity) value has no other finite value to scale
    // against, so it falls into the empty-state ("Sin datos") path.
    expect(cases[4]).toContain("Sin datos");
    expect(cases[5]).toContain("Sin datos");

    // A mixed dataset with one non-finite value among otherwise-valid bars:
    // the NaN datum's bar is skipped entirely, but the valid bars still render.
    const mixed = renderBarChartSvg({
      title: "G",
      data: [
        { label: "valid-a", value: 100 },
        { label: "invalid-nan", value: NaN },
        { label: "valid-c", value: 50 },
      ],
    });
    expect(mixed).not.toContain("NaN");
    expect(mixed).not.toContain("Infinity");
    expect(mixed).not.toContain("Sin datos");
    expect(mixed).toContain("valid-a");
    expect(mixed).toContain("valid-c");
    expect(mixed).not.toContain("invalid-nan");
    expect(countOccurrences(mixed, "<rect")).toBe(1 + 2); // background + 2 valid bars, NaN bar skipped
  });

  it("truncates long labels with an ellipsis instead of overflowing the canvas", () => {
    const longName = "Cliente Con Un Nombre Extremadamente Largo Que Excede El Limite S.A.S.";
    expect(longName.length).toBeGreaterThan(40);

    const svg = renderBarChartSvg({
      title: "Mayores saldos",
      data: [{ label: longName, value: 500_000 }],
      orientation: "horizontal",
      valueFormatter: formatCOP,
    });

    expect(svg).toContain("…");
    expect(svg).not.toContain(longName);
  });

  it("escapes XML-sensitive characters in labels and titles", () => {
    const svg = renderBarChartSvg({
      title: "Reporte & Cia <test>",
      data: [{ label: "A & B \"quoted\"", value: 10 }],
    });

    expect(svg).toContain("Reporte &amp; Cia &lt;test&gt;");
    expect(svg).toContain("A &amp; B &quot;quoted&quot;");
    expect(svg).not.toContain("A & B \"quoted\"");
  });
});
