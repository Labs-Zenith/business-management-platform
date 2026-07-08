import { describe, expect, it } from "vitest";
import { computeStatus } from "./status";

const NOW = new Date("2026-07-08T00:00:00.000Z");

describe("computeStatus", () => {
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
});
