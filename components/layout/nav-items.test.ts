import { afterEach, describe, expect, it } from "vitest";
import { NAV_ITEMS, NAV_ITEMS_BY_ID, resolveVisibleNavIds } from "./nav-items";

const BIZ_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BIZ_ID = "10000000-0000-4000-8000-000000000002";

/**
 * `resolveVisibleNavIds(role, businessId)`, the SERVER-only single source of
 * truth for which nav ids a session sees — applies BOTH the role
 * `capability` gate (Nómina, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`) and
 * the per-business `feature` gate (Ventas, `PIPELINE_ENABLED_BUSINESS_IDS`).
 * Nav filtering is a UX complement only (the spec's own "Nav Filtering Is a
 * UX Complement, Not a Security Boundary" requirement); the authoritative
 * check lives in `lib/session.ts`'s
 * `requireCapability`/`requireCapabilityOrNotFound`.
 */
describe("resolveVisibleNavIds", () => {
  afterEach(() => {
    delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
  });

  it("excludes Ventas (no PIPELINE_ENABLED_BUSINESS_IDS) and Nómina (worker lacks viewPayroll), including every ungated id in order", () => {
    const ids = resolveVisibleNavIds("worker", BIZ_ID);

    expect(ids).not.toContain("ventas");
    expect(ids).not.toContain("nomina");
    expect(ids).toEqual(["dashboard", "customers", "invoices", "payments", "egresos", "inventario", "settings"]);
  });

  it("excludes Ventas but includes Nómina for an admin session (holds viewPayroll) when the feature is disabled", () => {
    const ids = resolveVisibleNavIds("admin", BIZ_ID);

    expect(ids).not.toContain("ventas");
    expect(ids).toContain("nomina");
    expect(ids).toEqual([
      "dashboard",
      "customers",
      "invoices",
      "payments",
      "egresos",
      "nomina",
      "inventario",
      "settings",
    ]);
  });

  it("keeps every capability-less, feature-less nav item for both roles (Dashboard/Clientes/Facturas/Ingresos/Egresos/Inventario/Configuración never filtered)", () => {
    const ungatedIds = NAV_ITEMS.filter((item) => !item.capability && !item.feature).map((item) => item.id);
    expect(ungatedIds.length).toBeGreaterThan(0);

    const workerIds = resolveVisibleNavIds("worker", BIZ_ID);
    const adminIds = resolveVisibleNavIds("admin", BIZ_ID);

    for (const id of ungatedIds) {
      expect(workerIds).toContain(id);
      expect(adminIds).toContain(id);
    }
  });

  it("includes Ventas for a business in PIPELINE_ENABLED_BUSINESS_IDS, but not for a different business", () => {
    process.env.PIPELINE_ENABLED_BUSINESS_IDS = BIZ_ID;

    expect(resolveVisibleNavIds("admin", BIZ_ID)).toContain("ventas");
    expect(resolveVisibleNavIds("admin", OTHER_BIZ_ID)).not.toContain("ventas");
  });

  it("includes Ventas for a worker session once enabled for the business, but never Nómina (role gate still applies on top of the feature gate)", () => {
    process.env.PIPELINE_ENABLED_BUSINESS_IDS = BIZ_ID;

    const ids = resolveVisibleNavIds("worker", BIZ_ID);

    expect(ids).toContain("ventas");
    expect(ids).not.toContain("nomina");
  });

  /**
   * Fase 5.1 Lane B: `business-switcher.tsx` was rewritten into an inline
   * "switch business" `Collapsible` and no longer surfaces
   * Configuración/Editar perfil links itself, so Settings gets its own
   * plain (capability-less) `NAV_ITEMS` entry, visible to every role, at
   * the end of the list. Fase 5.2 F3 renamed its label to "Configuración".
   */
  it("includes a Configuración nav item (/settings) at the end of NAV_ITEMS, visible to every role", () => {
    expect(NAV_ITEMS.at(-1)).toMatchObject({ id: "settings", href: "/settings", label: "Configuración" });
    expect(resolveVisibleNavIds("worker", BIZ_ID)).toContain("settings");
    expect(resolveVisibleNavIds("admin", BIZ_ID)).toContain("settings");
  });

  it("NAV_ITEMS_BY_ID resolves the Ventas id to its /ventas href", () => {
    expect(NAV_ITEMS_BY_ID["ventas"].href).toBe("/ventas");
  });
});
