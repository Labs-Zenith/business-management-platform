import { afterEach, describe, expect, it, vi } from "vitest";
import { daysAgoIsoDate, formatDateRange, formatDateTime, todayIsoDate } from "./dates";

describe("todayIsoDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the LOCAL date, not UTC's, even when local time has rolled into the next UTC day", () => {
    // Pin a single fixed instant: 2026-07-06T23:30:00-05:00, i.e. 2026-07-07T04:30:00Z.
    // For a UTC-5 zone (Colombia, no DST) this is evening-local but already the NEXT
    // day in UTC — exactly the case where `.toISOString().slice(0, 10)` (UTC-based)
    // would silently disagree with the user's local calendar date.
    const pinnedInstant = new Date("2026-07-07T04:30:00Z");
    vi.setSystemTime(pinnedInstant);

    const expectedLocalDate = `${pinnedInstant.getFullYear()}-${String(pinnedInstant.getMonth() + 1).padStart(2, "0")}-${String(pinnedInstant.getDate()).padStart(2, "0")}`;
    const expectedUtcDate = pinnedInstant.toISOString().slice(0, 10);

    expect(todayIsoDate()).toBe(expectedLocalDate);
    if (expectedLocalDate !== expectedUtcDate) {
      expect(todayIsoDate()).not.toBe(expectedUtcDate);
    }
  });

  it("pads single-digit months and days with a leading zero", () => {
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0));
    expect(todayIsoDate()).toBe("2026-01-05");
  });

  it("returns the correct earlier LOCAL year at a year boundary, not UTC's already-rolled-over year", () => {
    // Pin a single fixed instant: 2026-12-31T22:00:00-05:00, i.e. 2027-01-01T03:00:00Z.
    // For a UTC-5 zone (Colombia, no DST) this is evening-local on Dec 31 of 2026, but
    // UTC has already rolled over to Jan 1 of the NEXT year — this exercises the
    // year-rollover arithmetic specifically, not just a day-rollover within the same year.
    const pinnedInstant = new Date("2027-01-01T03:00:00Z");
    vi.setSystemTime(pinnedInstant);

    const expectedLocalDate = `${pinnedInstant.getFullYear()}-${String(pinnedInstant.getMonth() + 1).padStart(2, "0")}-${String(pinnedInstant.getDate()).padStart(2, "0")}`;
    const expectedUtcDate = pinnedInstant.toISOString().slice(0, 10);

    expect(todayIsoDate()).toBe(expectedLocalDate);
    if (expectedLocalDate !== expectedUtcDate) {
      expect(todayIsoDate()).not.toBe(expectedUtcDate);
    }
  });
});

describe("formatDateTime", () => {
  it("formats an ISO timestamp as a Colombian date + time, not the raw ISO", () => {
    // 12:00 UTC → 07:00 in Bogota (UTC-5).
    const out = formatDateTime("2026-07-01T12:00:00.000Z");
    expect(out).toMatch(/1 de jul de 2026/);
    expect(out).toMatch(/7:00/);
    expect(out).not.toContain("2026-07-01T12:00:00.000Z");
  });

  it("uses America/Bogota rather than UTC (a late-UTC instant stays on the local day)", () => {
    // 02:00 UTC on Jul 2 is 21:00 on Jul 1 in Bogota (UTC-5).
    const out = formatDateTime("2026-07-02T02:00:00.000Z");
    expect(out).toMatch(/1 de jul de 2026/);
    expect(out).toMatch(/9:00/);
  });

  it('returns "-" for empty input', () => {
    expect(formatDateTime("")).toBe("-");
  });

  it("echoes the raw value back when it is not a valid date", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

/**
 * `daysAgoIsoDate` backs the dashboard's rolling 30-day window, so it takes an
 * explicit `now` instead of needing the clock frozen.
 */
describe("daysAgoIsoDate", () => {
  it("steps back within the same month", () => {
    expect(daysAgoIsoDate(29, new Date(2026, 6, 31))).toBe("2026-07-02");
  });

  it("steps back across a month boundary", () => {
    expect(daysAgoIsoDate(29, new Date(2026, 7, 1))).toBe("2026-07-03");
  });

  it("steps back across a year boundary", () => {
    expect(daysAgoIsoDate(29, new Date(2026, 0, 10))).toBe("2025-12-12");
  });

  it("counts the leap day when the window crosses February", () => {
    // 29 days back from 20 March 2024 lands on 20 February precisely because
    // 29 February exists that year; the same step in 2026 lands on the 19th.
    expect(daysAgoIsoDate(29, new Date(2024, 2, 20))).toBe("2024-02-20");
    expect(daysAgoIsoDate(29, new Date(2026, 2, 20))).toBe("2026-02-19");
  });

  it("returns the same day for 0", () => {
    expect(daysAgoIsoDate(0, new Date(2026, 6, 15))).toBe("2026-07-15");
  });

  it("stays on the LOCAL day late in the evening", () => {
    // 23:30 local at UTC-5 is already tomorrow in UTC; the window must not slide.
    expect(daysAgoIsoDate(29, new Date(2026, 7, 1, 23, 30))).toBe("2026-07-03");
  });
});

describe("formatDateRange", () => {
  it("renders both dates in a single range phrase", () => {
    // Locale output varies by ICU build, so assert the parts rather than an
    // exact string: what matters is that both dates survive intact.
    const range = formatDateRange("2026-07-03", "2026-08-01");

    expect(range).toMatch(/^Del /);
    expect(range).toContain(" al ");
    expect(range).toMatch(/\b3\b/);
    expect(range).toMatch(/\b1\b/);
  });

  it("does not shift a date back a day (the UTC-midnight parsing trap)", () => {
    // `new Date("2026-07-03")` is UTC midnight, which renders as 2 July at
    // UTC-5. Parsing at local midday is what keeps this on the 3rd.
    expect(formatDateRange("2026-07-03", "2026-07-03")).toMatch(/\b3\b.*\b3\b/);
  });

  it("echoes the raw strings back rather than throwing on bad input", () => {
    expect(formatDateRange("no-es-fecha", "tampoco")).toBe("no-es-fecha - tampoco");
  });
});
