import { afterEach, describe, expect, it } from "vitest";
import { computeStatus } from "./status";

const NOW = new Date("2026-07-08T00:00:00.000Z");

const ORIGINAL_TZ = process.env.TZ;

describe("computeStatus", () => {
  afterEach(() => {
    // `process.env.TZ = undefined` does NOT unset the variable — Node
    // stringifies it to the literal `"undefined"`, an invalid IANA zone name
    // that silently falls back to UTC — so delete the key outright when it
    // was originally unset, matching `components/ui/date-picker.test.tsx`.
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = ORIGINAL_TZ;
    }
  });

  it("returns paid when balance is 0", () => {
    expect(computeStatus(100000, 100000, "2026-07-01", NOW)).toBe("paid");
  });

  it("returns paid even when due_date is in the future and there are no payments, as long as balance is 0", () => {
    expect(computeStatus(0, 0, "2026-12-01", NOW)).toBe("paid");
  });

  it("returns partially_paid when balance > 0 and at least one payment exists (precedence over overdue)", () => {
    // due_date already passed but a payment exists -> partially_paid, NOT overdue
    expect(computeStatus(100000, 40000, "2026-01-01", NOW)).toBe("partially_paid");
  });

  it("returns pending when balance > 0, no payments, and due_date is in the future", () => {
    expect(computeStatus(100000, 0, "2026-12-01", NOW)).toBe("pending");
  });

  it("returns pending when balance > 0, no payments, and due_date is null", () => {
    expect(computeStatus(100000, 0, null, NOW)).toBe("pending");
  });

  it("returns overdue when balance > 0, no payments, and due_date has passed", () => {
    expect(computeStatus(100000, 0, "2026-01-01", NOW)).toBe("overdue");
  });

  it("respects full precedence order paid > partially_paid > overdue > pending in a single pass", () => {
    // Same overdue due_date, vary paid amount to walk through every branch.
    const overdueDueDate = "2026-01-01";
    expect(computeStatus(100000, 100000, overdueDueDate, NOW)).toBe("paid");
    expect(computeStatus(100000, 50000, overdueDueDate, NOW)).toBe("partially_paid");
    expect(computeStatus(100000, 0, overdueDueDate, NOW)).toBe("overdue");
  });

  /**
   * The 7 tests above never exercise a `dueDate` within days of `NOW` — every
   * one is months away — which is exactly why the UTC-midnight-parsing bug
   * (`new Date("2026-08-06")` is 2026-08-05T19:00 in Bogota, UTC-5) shipped
   * unnoticed: `computeStatus` must compare CALENDAR DAYS, not instants.
   *
   * `process.env.TZ` is pinned to a zone unmistakably different from the
   * business's own (`America/Bogota`) to prove the result does not depend on
   * the host process's ambient timezone — mirroring
   * `components/ui/date-picker.test.tsx`'s pattern.
   */
  describe("calendar-day boundary (dueDate compared as a Bogota calendar day, not a UTC instant)", () => {
    it("is pending when dueDate is today", () => {
      process.env.TZ = "Asia/Tokyo";
      // 2026-08-06T12:00:00Z = 07:00 local in Bogota (UTC-5) on 2026-08-06,
      // so "today" in the app's timezone is 2026-08-06.
      const now = new Date("2026-08-06T12:00:00.000Z");
      expect(computeStatus(100000, 0, "2026-08-06", now)).toBe("pending");
    });

    it("is pending when dueDate is tomorrow, evaluated at 22:00 Bogota time (the exact regression)", () => {
      process.env.TZ = "Asia/Tokyo";
      // 22:00 on 2026-08-05 in Bogota (UTC-5) is 2026-08-06T03:00:00Z: already
      // "tomorrow" under a naive `getTime()` instant comparison, which is
      // precisely what made an invoice due the 6th read "overdue" hours early.
      const now = new Date("2026-08-06T03:00:00.000Z");
      expect(computeStatus(100000, 0, "2026-08-06", now)).toBe("pending");
    });

    it("is overdue once dueDate's calendar day has fully passed", () => {
      process.env.TZ = "Asia/Tokyo";
      // "today" in Bogota is still 2026-08-06 (see the first case above).
      const now = new Date("2026-08-06T12:00:00.000Z");
      expect(computeStatus(100000, 0, "2026-08-05", now)).toBe("overdue");
    });
  });
});
