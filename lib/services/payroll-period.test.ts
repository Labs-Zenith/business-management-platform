import { describe, expect, it } from "vitest";
import { computePeriod, periodDays } from "./payroll-period";

/**
 * Table-driven boundary cases matching all 4 spec scenarios in
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Period Type Determines Computed Period Range" requirement, plus extra
 * 30-day-month and year-end-rollover coverage per the tasks/apply brief.
 */

describe("computePeriod", () => {
  it("mensual spans the full calendar month (28-day February)", () => {
    expect(computePeriod("mensual", "2026-02-10")).toEqual({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
    });
  });

  it("quincenal — first half (day <= 15)", () => {
    expect(computePeriod("quincenal", "2026-07-05")).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-15",
    });
  });

  it("quincenal — exactly on the 15th boundary (still first half)", () => {
    expect(computePeriod("quincenal", "2026-07-15")).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-15",
    });
  });

  it("quincenal — exactly on the 16th boundary (second half begins)", () => {
    expect(computePeriod("quincenal", "2026-07-16")).toEqual({
      periodStart: "2026-07-16",
      periodEnd: "2026-07-31",
    });
  });

  it("quincenal — second half across a 31-day month", () => {
    expect(computePeriod("quincenal", "2026-07-20")).toEqual({
      periodStart: "2026-07-16",
      periodEnd: "2026-07-31",
    });
  });

  it("quincenal — second half across a leap-year February (29 days)", () => {
    expect(computePeriod("quincenal", "2028-02-20")).toEqual({
      periodStart: "2028-02-16",
      periodEnd: "2028-02-29",
    });
  });

  it("quincenal — second half across a non-leap-year February (28 days)", () => {
    expect(computePeriod("quincenal", "2026-02-20")).toEqual({
      periodStart: "2026-02-16",
      periodEnd: "2026-02-28",
    });
  });

  it("quincenal — second half across a 30-day month (April)", () => {
    expect(computePeriod("quincenal", "2026-04-20")).toEqual({
      periodStart: "2026-04-16",
      periodEnd: "2026-04-30",
    });
  });

  it("mensual — full span of a 30-day month (April)", () => {
    expect(computePeriod("mensual", "2026-04-05")).toEqual({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
  });

  it("mensual — full span of a 31-day month (January)", () => {
    expect(computePeriod("mensual", "2026-01-15")).toEqual({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
  });

  it("year-end rollover: mensual for December stays within December (no bleed into January)", () => {
    expect(computePeriod("mensual", "2026-12-25")).toEqual({
      periodStart: "2026-12-01",
      periodEnd: "2026-12-31",
    });
  });

  it("year-end rollover: quincenal second half of December stays within December", () => {
    expect(computePeriod("quincenal", "2026-12-31")).toEqual({
      periodStart: "2026-12-16",
      periodEnd: "2026-12-31",
    });
  });

  it("documents the intentional fallback: any periodType value other than 'mensual' (not just the literal 'quincenal') is treated as quincenal — locks in the contract that TypeScript's 'quincenal'|'mensual' union is the only thing preventing an untrusted runtime value from reaching here today", () => {
    const invalidPeriodType = "anual" as unknown as Parameters<typeof computePeriod>[0];

    expect(computePeriod(invalidPeriodType, "2026-07-20")).toEqual({
      periodStart: "2026-07-16",
      periodEnd: "2026-07-31",
    });
  });
});

describe("periodDays", () => {
  it("computes an inclusive day count for a quincenal first-half range", () => {
    expect(periodDays("2026-07-01", "2026-07-15")).toBe(15);
  });

  it("computes an inclusive day count for a mensual 31-day range", () => {
    expect(periodDays("2026-07-01", "2026-07-31")).toBe(31);
  });

  it("computes an inclusive day count for a mensual leap-year February range", () => {
    expect(periodDays("2028-02-01", "2028-02-29")).toBe(29);
  });
});
