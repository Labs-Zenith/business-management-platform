import { afterEach, describe, expect, it, vi } from "vitest";
import { todayIsoDate } from "./dates";

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
