/**
 * Pure, dependency-free bar-chart SVG string builder for the dashboard's
 * Excel/PDF export chart images (see `lib/export/chart-image.ts`, which
 * rasterizes this SVG to PNG via `sharp`). Kept fully deterministic and
 * side-effect-free so it's directly unit-testable without touching `sharp`
 * or any binary image assertions — see `chart-svg.test.ts`.
 *
 * This is a static report image, not an interactive chart: legibility at
 * ~640x320 is the only goal, not feature parity with the on-screen
 * `recharts` bar charts in `components/domain/dashboard/*-chart-cards.tsx`.
 */

/** Same 5-color palette as `app/globals.css`'s `--chart-1`..`--chart-5` tokens. */
export const CHART_COLORS = {
  chart1: "#50e3c2",
  chart2: "#0070f3",
  chart3: "#7928ca",
  chart4: "#ff0080",
  chart5: "#f5a623",
};

const DEFAULT_PALETTE = [
  CHART_COLORS.chart1,
  CHART_COLORS.chart2,
  CHART_COLORS.chart3,
  CHART_COLORS.chart4,
  CHART_COLORS.chart5,
];

export type BarDatum = {
  label: string;
  value: number;
  /** Overrides the auto-cycled default palette color for this single bar. */
  color?: string;
};

export type BarChartSvgOptions = {
  title: string;
  data: BarDatum[];
  /** `"horizontal"` fits long category names (e.g. top-debtor customer names) better than `"vertical"`. */
  orientation?: "vertical" | "horizontal";
  width?: number;
  height?: number;
  valueFormatter?: (value: number) => string;
};

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 320;
const OUTER_MARGIN = 16;
const TITLE_BASELINE_Y = 26;
const CHART_TOP_OFFSET = 56;
const VERTICAL_LABEL_AREA_HEIGHT = 34;
const HORIZONTAL_LEFT_LABEL_WIDTH = 140;
const HORIZONTAL_RIGHT_VALUE_WIDTH = 70;
/** Bar thickness as a fraction of its slot, in both orientation branches. */
const BAR_THICKNESS_RATIO = 0.6;
/** Category labels longer than this are truncated with an ellipsis, mirroring the on-screen chart's own truncation in `dashboard-chart-cards.tsx`. */
const MAX_LABEL_LENGTH = 18;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgText(
  content: string,
  x: number,
  y: number,
  opts: { anchor?: "start" | "middle" | "end"; size?: number; weight?: "normal" | "bold"; fill?: string } = {},
): string {
  const { anchor = "start", size = 11, weight = "normal", fill = "#171717" } = opts;
  return `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
}

function svgRect(x: number, y: number, width: number, height: number, fill: string): string {
  if (width <= 0 || height <= 0) return "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" rx="2" />`;
}

/** Truncates a label to `MAX_LABEL_LENGTH` characters (plus an ellipsis) so long names never draw off-canvas. */
function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH)}…` : label;
}

function renderEmptyState(width: number, height: number, title: string): string {
  const parts = [
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
    svgText(title, width / 2, TITLE_BASELINE_Y, { anchor: "middle", size: 16, weight: "bold" }),
    svgText("Sin datos", width / 2, height / 2, { anchor: "middle", size: 14, fill: "#999999" }),
  ];
  return wrapSvg(width, height, parts);
}

function wrapSvg(width: number, height: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body.join("")}</svg>`;
}

/**
 * Renders a static bar chart as a self-contained `<svg>` string: white
 * background, a title, one bar per non-zero datum (scaled to the max
 * value), category labels, and a formatted value label per bar. Never
 * divides by zero — an empty `data` array, or a `data` array whose (finite)
 * values are all `<= 0`, renders the title plus a "Sin datos" placeholder
 * instead. Any individual `datum.value` that is `NaN`/`Infinity` is ignored
 * when computing the max (treated as `0`) and its bar is skipped entirely —
 * this never emits `NaN`/`Infinity` into the output, no matter what upstream
 * data looks like.
 */
export function renderBarChartSvg(opts: BarChartSvgOptions): string {
  const {
    title,
    data,
    orientation = "vertical",
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    valueFormatter = (value: number) => String(value),
  } = opts;

  const maxValue = data.reduce((max, datum) => {
    const value = Number.isFinite(datum.value) ? datum.value : 0;
    return Math.max(max, value);
  }, 0);
  if (data.length === 0 || !Number.isFinite(maxValue) || maxValue <= 0) {
    return renderEmptyState(width, height, title);
  }

  const body: string[] = [
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
    svgText(title, width / 2, TITLE_BASELINE_Y, { anchor: "middle", size: 16, weight: "bold" }),
  ];

  if (orientation === "horizontal") {
    const left = HORIZONTAL_LEFT_LABEL_WIDTH;
    const right = width - OUTER_MARGIN - HORIZONTAL_RIGHT_VALUE_WIDTH;
    const top = CHART_TOP_OFFSET;
    const bottom = height - OUTER_MARGIN;
    const chartWidth = right - left;
    const chartHeight = bottom - top;
    const barSlot = chartHeight / data.length;
    const barHeight = barSlot * BAR_THICKNESS_RATIO;

    data.forEach((datum, index) => {
      if (!Number.isFinite(datum.value)) return; // non-finite values render no bar at all

      const color = datum.color ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
      const barWidth = (Math.max(datum.value, 0) / maxValue) * chartWidth;
      const y = top + index * barSlot + (barSlot - barHeight) / 2;
      const textY = y + barHeight / 2 + 4;

      body.push(svgRect(left, y, barWidth, barHeight, color));
      body.push(svgText(truncateLabel(datum.label), left - 8, textY, { anchor: "end", size: 11, fill: "#171717" }));
      body.push(
        svgText(valueFormatter(datum.value), left + barWidth + 8, textY, { anchor: "start", size: 11, fill: "#171717" }),
      );
    });
  } else {
    const left = OUTER_MARGIN;
    const right = width - OUTER_MARGIN;
    const top = CHART_TOP_OFFSET;
    const bottom = height - OUTER_MARGIN - VERTICAL_LABEL_AREA_HEIGHT;
    const chartWidth = right - left;
    const chartHeight = bottom - top;
    const barSlot = chartWidth / data.length;
    const barWidth = barSlot * BAR_THICKNESS_RATIO;

    data.forEach((datum, index) => {
      if (!Number.isFinite(datum.value)) return; // non-finite values render no bar at all

      const color = datum.color ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
      const barHeight = (Math.max(datum.value, 0) / maxValue) * chartHeight;
      const x = left + index * barSlot + (barSlot - barWidth) / 2;
      const y = bottom - barHeight;
      const labelX = x + barWidth / 2;

      body.push(svgRect(x, y, barWidth, barHeight, color));
      body.push(
        svgText(valueFormatter(datum.value), labelX, Math.max(y - 6, TITLE_BASELINE_Y + 14), {
          anchor: "middle",
          size: 11,
          fill: "#171717",
        }),
      );
      body.push(svgText(truncateLabel(datum.label), labelX, bottom + 16, { anchor: "middle", size: 10, fill: "#666666" }));
    });
  }

  return wrapSvg(width, height, body);
}
