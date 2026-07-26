import { describe, expect, it } from "vitest";
import type { Feature } from "@/lib/services/ports";
import { NAV_ITEMS, NAV_ITEMS_BY_ID, resolveVisibleNavIds } from "./nav-items";

const NO_FEATURES: ReadonlySet<Feature> = new Set();
const PIPELINE_ENABLED: ReadonlySet<Feature> = new Set(["pipeline"]);

/**
 * `resolveVisibleNavIds(role, enabledFeatures)`, the SERVER-only single
 * source of truth for which nav ids a session sees — applies BOTH the role
 * `capability` gate (Nómina, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`) and
 * the per-business `feature` gate (Ventas), now driven by an already-resolved
 * `Set<Feature>` (the caller, `app/(dashboard)/layout.tsx`, resolves it from
 * the DB-backed `business_features` table via
 * `lib/services/features.ts#listEnabledFeatures`) rather than an env var —
 * this file stays free of any DB/repositories import (see this file's module
 * doc comment). Nav filtering is a UX complement only (the spec's own "Nav
 * Filtering Is a UX Complement, Not a Security Boundary" requirement); the
 * authoritative check lives in `lib/session.ts`'s
 * `requireCapability`/`requireCapabilityOrNotFound`.
 */
describe("resolveVisibleNavIds", () => {
  it("excludes Ventas (empty enabledFeatures) and Nómina (worker lacks viewPayroll), including every ungated id in order", () => {
    const ids = resolveVisibleNavIds("worker", NO_FEATURES);

    expect(ids).not.toContain("ventas");
    expect(ids).not.toContain("nomina");
    expect(ids).toEqual(["dashboard", "customers", "invoices", "payments", "egresos", "inventario", "settings"]);
  });

  it("excludes Ventas but includes Nómina for an admin session (holds viewPayroll) when the feature is disabled", () => {
    const ids = resolveVisibleNavIds("admin", NO_FEATURES);

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

    const workerIds = resolveVisibleNavIds("worker", NO_FEATURES);
    const adminIds = resolveVisibleNavIds("admin", NO_FEATURES);

    for (const id of ungatedIds) {
      expect(workerIds).toContain(id);
      expect(adminIds).toContain(id);
    }
  });

  it("includes Ventas when the pipeline feature is in enabledFeatures, but not for an empty set (a different/disabled business)", () => {
    expect(resolveVisibleNavIds("admin", PIPELINE_ENABLED)).toContain("ventas");
    expect(resolveVisibleNavIds("admin", NO_FEATURES)).not.toContain("ventas");
  });

  it("includes Ventas for a worker session once the pipeline feature is enabled, but never Nómina (role gate still applies on top of the feature gate)", () => {
    const ids = resolveVisibleNavIds("worker", PIPELINE_ENABLED);

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
    expect(resolveVisibleNavIds("worker", NO_FEATURES)).toContain("settings");
    expect(resolveVisibleNavIds("admin", NO_FEATURES)).toContain("settings");
  });

  it("NAV_ITEMS_BY_ID resolves the Ventas id to its /ventas href", () => {
    expect(NAV_ITEMS_BY_ID["ventas"].href).toBe("/ventas");
  });
});
