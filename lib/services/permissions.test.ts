import { describe, expect, it } from "vitest";
import type { Capability } from "./permissions";
import { can, canViewPayroll } from "./permissions";

describe("can — deny-by-default capability check", () => {
  it("allows admin to viewPayroll", () => {
    expect(can("admin", "viewPayroll")).toBe(true);
  });

  it("denies worker viewPayroll", () => {
    expect(can("worker", "viewPayroll")).toBe(false);
  });

  it("denies by default for a capability with no mapped roles", () => {
    // Cast through an unmapped capability key to prove `can` never throws
    // and defaults to `false` for anything absent from CAPABILITY_ROLES.
    const unmapped = "unmappedCapability" as Capability;
    expect(can("admin", unmapped)).toBe(false);
    expect(can("worker", unmapped)).toBe(false);
  });
});

describe("canViewPayroll", () => {
  it("is true for admin", () => {
    expect(canViewPayroll("admin")).toBe(true);
  });

  it("is false for worker", () => {
    expect(canViewPayroll("worker")).toBe(false);
  });
});
