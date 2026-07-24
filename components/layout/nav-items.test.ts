import { afterEach, describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemsFor, navItemsForRole, resolveEnabledFeatures } from "./nav-items";

const BIZ_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BIZ_ID = "10000000-0000-4000-8000-000000000002";

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

  it("keeps every capability-less nav item for both roles (Dashboard/Clientes/Facturas/Ingresos/Egresos/Inventario never filtered)", () => {
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

  /**
   * Fase 5.1 Lane B: `business-switcher.tsx` was rewritten into an inline
   * "switch business" `Collapsible` and no longer surfaces
   * Configuración/Editar perfil links itself, so Settings gets its own
   * plain (capability-less) `NAV_ITEMS` entry, visible to every role, at
   * the end of the list. Fase 5.2 F3 renamed its label to "Configuración".
   */
  it("includes a Configuración nav item (/settings) at the end of NAV_ITEMS, visible to every role", () => {
    expect(NAV_ITEMS.at(-1)).toMatchObject({ href: "/settings", label: "Configuración" });
    expect(navItemsForRole("worker").some((item) => item.href === "/settings")).toBe(true);
    expect(navItemsForRole("admin").some((item) => item.href === "/settings")).toBe(true);
  });

  it("includes the Ventas nav item unconditionally (no capability, only a feature flag) for both roles", () => {
    expect(navItemsForRole("worker").some((item) => item.href === "/ventas")).toBe(true);
    expect(navItemsForRole("admin").some((item) => item.href === "/ventas")).toBe(true);
  });
});

describe("navItemsFor", () => {
  it("hides the Ventas nav item when the feature list is empty (deny-by-default)", () => {
    expect(navItemsFor("admin", []).some((item) => item.href === "/ventas")).toBe(false);
    expect(navItemsFor("worker", []).some((item) => item.href === "/ventas")).toBe(false);
  });

  it("shows the Ventas nav item when the pipeline feature is enabled", () => {
    expect(navItemsFor("admin", ["pipeline"]).some((item) => item.href === "/ventas")).toBe(true);
  });

  it("still applies the role/capability filter on top of the feature filter (Nómina stays gated)", () => {
    const workerItems = navItemsFor("worker", ["pipeline"]);
    expect(workerItems.some((item) => item.href === "/ventas")).toBe(true);
    expect(workerItems.some((item) => item.href === "/nomina")).toBe(false);
  });
});

/**
 * `resolveEnabledFeatures` is the SERVER-only piece that reads
 * `PIPELINE_ENABLED_BUSINESS_IDS` — `navItemsFor` above is pure and no
 * longer touches `process.env` at all (that responsibility moved here).
 */
describe("resolveEnabledFeatures", () => {
  afterEach(() => {
    delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
  });

  it("returns an empty array by default (deny-by-default, empty allowlist)", () => {
    expect(resolveEnabledFeatures(BIZ_ID)).toEqual([]);
  });

  it("returns [\"pipeline\"] for a business in PIPELINE_ENABLED_BUSINESS_IDS", () => {
    process.env.PIPELINE_ENABLED_BUSINESS_IDS = BIZ_ID;

    expect(resolveEnabledFeatures(BIZ_ID)).toEqual(["pipeline"]);
  });

  it("returns an empty array for a business NOT in PIPELINE_ENABLED_BUSINESS_IDS", () => {
    process.env.PIPELINE_ENABLED_BUSINESS_IDS = BIZ_ID;

    expect(resolveEnabledFeatures(OTHER_BIZ_ID)).toEqual([]);
  });
});
