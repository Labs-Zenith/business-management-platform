import { describe, expect, it } from "vitest";
import { monthEnd, monthLongLabel, monthShortLabel, parsePeriodParam, presetOptions } from "./dashboard-period";

/**
 * `parsePeriodParam` takes `now` explicitly, so every assertion here pins a
 * fixed reference date instead of depending on when the suite runs. The one
 * exception is the timezone test at the bottom, which is the whole point.
 */

// Mid-month, mid-year: far from any boundary that could mask an off-by-one.
const NOW = new Date(2026, 6, 15); // 15 July 2026, local
// Deliberately the LAST instant of a day in a timezone behind UTC: with
// `toISOString()` this would already read as the next day (and, on the 31st,
// the next month) — the exact bug `lib/dates.ts` warns about.
const LATE_ON_MONTH_END = new Date(2026, 6, 31, 23, 30);

describe("parsePeriodParam", () => {
  it("defaults to the last 30 days — the dashboard's fixed window", () => {
    const period = parsePeriodParam(undefined, NOW);

    // 30 days INCLUDING today, so 29 back from 15 July is 16 June, and the
    // range ends today rather than at a month end — that is the point of a
    // rolling window.
    expect(period).toMatchObject({
      key: "last30",
      preset: "last30",
      label: "Últimos 30 días",
      from: "2026-06-16",
      to: "2026-07-15",
    });
  });

  it("keeps the trend charts month-bucketed even for the 30-day window", () => {
    // 30 days is one and a bit bars, which says nothing about a trend. Each
    // chart names its own six-month window in its own description.
    expect(parsePeriodParam(undefined, NOW).chartMonths).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("resolves an explicit last30 the same way as the default", () => {
    expect(parsePeriodParam("last30", NOW)).toEqual(parsePeriodParam(undefined, NOW));
  });

  it("resolves an explicit month to that month's full calendar range", () => {
    const period = parsePeriodParam("2026-02", NOW);

    expect(period.key).toBe("2026-02");
    expect(period.label).toBe("Febrero 2026");
    expect(period.from).toBe("2026-02-01");
    // 2026 is not a leap year — derived, never a hardcoded table.
    expect(period.to).toBe("2026-02-28");
  });

  it("charts the 6 months ENDING at a selected month, so the trend context survives", () => {
    const period = parsePeriodParam("2026-02", NOW);

    expect(period.chartMonths).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it.each([
    ["last3", "Últimos 3 meses", "2026-05-01", ["2026-05", "2026-06", "2026-07"]],
    ["last6", "Últimos 6 meses", "2026-02-01", ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]],
  ])("resolves the %s preset to a rolling range ending this month", (key, label, from, chartMonths) => {
    const period = parsePeriodParam(key, NOW);

    expect(period).toMatchObject({ key, label, from, to: "2026-07-31" });
    expect(period.chartMonths).toEqual(chartMonths);
  });

  it("resolves thisYear to January through the current month", () => {
    const period = parsePeriodParam("thisYear", NOW);

    expect(period).toMatchObject({ key: "thisYear", label: "Este año", from: "2026-01-01", to: "2026-07-31" });
    expect(period.chartMonths).toHaveLength(7);
    expect(period.chartMonths[0]).toBe("2026-01");
    expect(period.chartMonths[6]).toBe("2026-07");
  });

  it("resolves all to an unbounded range, which the repositories read as 'no date filter'", () => {
    const period = parsePeriodParam("all", NOW);

    expect(period).toMatchObject({ key: "all", preset: "all", label: "Todo" });
    expect(period.from).toBeUndefined();
    expect(period.to).toBeUndefined();
    // No natural bucket span for "everything", so it keeps the 6-month default.
    expect(period.chartMonths).toHaveLength(6);
  });

  it.each([
    ["", "empty string"],
    ["2026-13", "impossible month"],
    ["2026-00", "zero month"],
    ["2026-7", "unpadded month"],
    ["julio", "free text"],
    ["2026-07-15", "a full date instead of a month"],
    ["2099-01", "a future month"],
    ["<script>", "an injection attempt"],
  ])("falls back to the last 30 days for %s (%s) instead of throwing", (raw) => {
    const period = parsePeriodParam(raw, NOW);

    expect(period.key).toBe("last30");
    expect(period.preset).toBe("last30");
  });

  it("accepts any well-formed past month, however old, with no lower bound", () => {
    // Validity is intentionally unbounded below: what the selector OFFERS is
    // bounded by real data (`dashboard-period-options.ts`), and a business
    // whose oldest invoice predates any fixed window must still be reachable.
    expect(parsePeriodParam("2024-08", NOW).key).toBe("2024-08");
    expect(parsePeriodParam("2019-01", NOW).key).toBe("2019-01");
    expect(parsePeriodParam("2001-12", NOW).key).toBe("2001-12");
  });

  it("rejects a future month, including next month", () => {
    expect(parsePeriodParam("2026-08", NOW).key).toBe("last30");
    expect(parsePeriodParam("2030-01", NOW).key).toBe("last30");
  });

  it("steps back across a year boundary without wrap-around bugs", () => {
    const january = new Date(2026, 0, 10);

    expect(parsePeriodParam("last3", january).chartMonths).toEqual(["2025-11", "2025-12", "2026-01"]);
    // January's "this year" is a single bucket, not an empty one.
    expect(parsePeriodParam("thisYear", january).chartMonths).toEqual(["2026-01"]);
  });

  it("derives dates from LOCAL time, so a late-evening run never rolls into the next day", () => {
    // `LATE_ON_MONTH_END.toISOString()` reads as 1 August in any timezone
    // behind UTC. The window must still end on 31 July.
    const period = parsePeriodParam(undefined, LATE_ON_MONTH_END);

    expect(period.to).toBe("2026-07-31");
    expect(period.from).toBe("2026-07-02");
  });

  it("resolves an explicit month to that month, unaffected by the new default", () => {
    expect(parsePeriodParam("2026-07", NOW)).toMatchObject({
      key: "2026-07",
      preset: "month",
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });
});

describe("monthEnd", () => {
  it.each([
    ["2026-01", "2026-01-31"],
    ["2026-02", "2026-02-28"],
    ["2024-02", "2024-02-29"], // leap year
    ["2026-04", "2026-04-30"],
    ["2026-12", "2026-12-31"],
  ])("resolves %s to %s", (month, expected) => {
    expect(monthEnd(month)).toBe(expected);
  });
});

describe("month labels", () => {
  it("capitalizes the long month name and appends the year", () => {
    expect(monthLongLabel("2026-07")).toBe("Julio 2026");
    expect(monthLongLabel("2025-12")).toBe("Diciembre 2025");
  });

  it("keeps short chart-axis labels lowercase and year-free", () => {
    expect(monthShortLabel("2026-07")).toMatch(/^jul/);
  });
});

describe("presetOptions", () => {
  it("offers the 5 ranges, unconditionally", () => {
    // These are pure date math and always make sense — even for a business
    // with no data at all, unlike the data-driven month list built by
    // `lib/services/dashboard-period-options.ts`.
    // `last30` leads: it is what the dashboard shows, so exporting it gives
    // you the file that matches what you were just looking at.
    expect(presetOptions().map((option) => option.value)).toEqual([
      "last30",
      "last3",
      "last6",
      "thisYear",
      "all",
    ]);
  });

  it("only offers values parsePeriodParam actually accepts", () => {
    for (const option of presetOptions()) {
      expect(parsePeriodParam(option.value, NOW).key).toBe(option.value);
    }
  });
});
