import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemsForRole } from "./nav-items";

/**
 * `navItemsForRole`, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`'s
 * "Navigation Items Are Filtered by Role" requirement — Nomina is the app's
 * first capability-tagged nav item. Nav filtering is a UX complement only
 * (the spec's own "Nav Filtering Is a UX Complement, Not a Security
 * Boundary" requirement); the authoritative check lives in
 * `lib/session.ts`'s `requireCapability`/`requireCapabilityOrNotFound`.
 */
describe("navItemsForRole", () => {
  it("excludes the Nómina nav item for a worker session (lacks viewPayroll)", () => {
    const items = navItemsForRole("worker");

    expect(items.some((item) => item.href === "/nomina")).toBe(false);
  });

  it("includes the Nómina nav item for an admin session (holds viewPayroll)", () => {
    const items = navItemsForRole("admin");

    expect(items.some((item) => item.href === "/nomina")).toBe(true);
  });

  it("keeps every capability-less nav item for both roles (Dashboard/Clientes/Facturas/Pagos/Egresos/Inventario never filtered)", () => {
    const capabilityLessHrefs = NAV_ITEMS.filter((item) => !item.capability).map((item) => item.href);
    expect(capabilityLessHrefs.length).toBeGreaterThan(0);

    const workerHrefs = navItemsForRole("worker").map((item) => item.href);
    const adminHrefs = navItemsForRole("admin").map((item) => item.href);

    for (const href of capabilityLessHrefs) {
      expect(workerHrefs).toContain(href);
      expect(adminHrefs).toContain(href);
    }
  });

  it("worker's filtered list has exactly one fewer item than admin's (only Nómina is gated today)", () => {
    const workerItems = navItemsForRole("worker");
    const adminItems = navItemsForRole("admin");

    expect(adminItems.length).toBe(workerItems.length + 1);
  });
});
