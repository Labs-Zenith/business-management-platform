import { describe, it, expect } from "vitest";
import { printingCatalog, countPriceOptions } from "./seed-printing-catalog";
import type { CatalogProductCreate, CatalogVariantCreate } from "@/lib/services/ports";

/**
 * Pure data test — NO database. Verifies the hand-transcribed catalog
 * literal (`printingCatalog`, exported by `seed-printing-catalog.ts`) matches
 * the shape the source document (`docs/printing/catalogo/printing.md`)
 * declares: "169 opciones de precio sobre 30 productos". This is the
 * regression net for a transcription slip, so assertions are deliberately
 * strict/sharp rather than loose sanity checks.
 */

const EXPECTED_PRODUCT_COUNT = 30;
const EXPECTED_PRICE_OPTION_COUNT = 169;

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

describe("printingCatalog", () => {
  it("has exactly 30 products", () => {
    expect(printingCatalog.length).toBe(EXPECTED_PRODUCT_COUNT);
  });

  it("has no duplicate product names", () => {
    const names = printingCatalog.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("has exactly 169 total price options (variant + package variants, tier rows, 1 per fixed/area product)", () => {
    const total = printingCatalog.reduce((sum, product) => sum + countPriceOptions(product), 0);
    expect(total).toBe(EXPECTED_PRICE_OPTION_COUNT);
  });

  it("matches the doc's own per-mode breakdown: 46 `variant` options, 26 `package` options, 97 `tiered` options", () => {
    const byMode: Record<CatalogProductCreate["pricingMode"], number> = {
      fixed: 0,
      variant: 0,
      package: 0,
      tiered: 0,
      area: 0,
    };
    for (const product of printingCatalog) {
      byMode[product.pricingMode] += countPriceOptions(product);
    }
    expect(byMode.variant).toBe(46);
    expect(byMode.package).toBe(26);
    expect(byMode.tiered).toBe(97);
    expect(byMode.fixed).toBe(0);
    expect(byMode.area).toBe(0);
  });

  it("has no `fixed`/`area` products (this source catalog only uses variant/package/tiered)", () => {
    for (const product of printingCatalog) {
      expect(["variant", "package", "tiered"]).toContain(product.pricingMode);
    }
  });

  describe("per-product pricingMode shape invariants", () => {
    for (const product of printingCatalog) {
      describe(`"${product.name}" (${product.pricingMode})`, () => {
        it("declares at least one variant", () => {
          expect(product.variants && product.variants.length).toBeGreaterThan(0);
        });

        it("has no duplicate tier quantities within any single variant", () => {
          for (const variant of product.variants ?? []) {
            const quantities = (variant.tiers ?? []).map((t) => t.quantity);
            expect(new Set(quantities).size).toBe(quantities.length);
          }
        });

        if (product.pricingMode === "variant") {
          it("every variant has a unitPrice, no package fields, no tiers", () => {
            for (const variant of product.variants ?? []) {
              expect(variant.unitPrice).toBeDefined();
              expect(typeof variant.unitPrice).toBe("number");
              expect(variant.packageQuantity).toBeUndefined();
              expect(variant.packageTotalPrice).toBeUndefined();
              expect(variant.tiers).toBeUndefined();
            }
          });
        }

        if (product.pricingMode === "package") {
          it("every variant has both package fields, no unitPrice, no tiers", () => {
            for (const variant of product.variants ?? []) {
              expect(variant.packageQuantity).toBeDefined();
              expect(variant.packageTotalPrice).toBeDefined();
              expect(variant.packageQuantity).toBeGreaterThan(0);
              expect(variant.unitPrice).toBeUndefined();
              expect(variant.tiers).toBeUndefined();
            }
          });
        }

        if (product.pricingMode === "tiered") {
          it("every variant has >= 1 tier and no unitPrice/package fields of its own", () => {
            for (const variant of product.variants ?? []) {
              expect(variant.unitPrice).toBeUndefined();
              expect(variant.packageQuantity).toBeUndefined();
              expect(variant.packageTotalPrice).toBeUndefined();
              expect(variant.tiers && variant.tiers.length).toBeGreaterThan(0);
            }
          });

          it("every tier has exactly one of unitPrice/flatTotalPrice, never both or neither", () => {
            for (const variant of product.variants ?? []) {
              for (const tier of variant.tiers ?? []) {
                const hasUnit = tier.unitPrice !== undefined;
                const hasFlat = tier.flatTotalPrice !== undefined;
                expect(hasUnit !== hasFlat).toBe(true);
                expect(tier.quantity).toBeGreaterThan(0);
              }
            }
          });
        }
      });
    }
  });

  it("has every money value as a non-negative integer (COP cents)", () => {
    const allVariants: CatalogVariantCreate[] = printingCatalog.flatMap((p) => p.variants ?? []);

    for (const product of printingCatalog) {
      if (product.fixedUnitPrice !== undefined) expect(isNonNegativeInteger(product.fixedUnitPrice)).toBe(true);
      if (product.areaBasePrice !== undefined) expect(isNonNegativeInteger(product.areaBasePrice)).toBe(true);
      if (product.areaRatePerM2 !== undefined) expect(isNonNegativeInteger(product.areaRatePerM2)).toBe(true);
      if (product.areaMinPrice !== undefined) expect(isNonNegativeInteger(product.areaMinPrice)).toBe(true);
    }

    for (const variant of allVariants) {
      if (variant.unitPrice !== undefined) expect(isNonNegativeInteger(variant.unitPrice)).toBe(true);
      if (variant.packageQuantity !== undefined) expect(isNonNegativeInteger(variant.packageQuantity)).toBe(true);
      if (variant.packageTotalPrice !== undefined) expect(isNonNegativeInteger(variant.packageTotalPrice)).toBe(true);
      for (const tier of variant.tiers ?? []) {
        expect(isNonNegativeInteger(tier.quantity)).toBe(true);
        if (tier.unitPrice !== undefined) expect(isNonNegativeInteger(tier.unitPrice)).toBe(true);
        if (tier.flatTotalPrice !== undefined) expect(isNonNegativeInteger(tier.flatTotalPrice)).toBe(true);
      }
    }
  });

  it("every price is a whole multiple of 100 cents (source catalog has no fractional-peso prices)", () => {
    const allVariants: CatalogVariantCreate[] = printingCatalog.flatMap((p) => p.variants ?? []);
    for (const variant of allVariants) {
      if (variant.unitPrice !== undefined) expect(variant.unitPrice % 100).toBe(0);
      if (variant.packageTotalPrice !== undefined) expect(variant.packageTotalPrice % 100).toBe(0);
      for (const tier of variant.tiers ?? []) {
        if (tier.unitPrice !== undefined) expect(tier.unitPrice % 100).toBe(0);
        if (tier.flatTotalPrice !== undefined) expect(tier.flatTotalPrice % 100).toBe(0);
      }
    }
  });

  // Spot-check a handful of exact figures straight from the source doc, in
  // cents, to catch a single-digit transcription slip that the aggregate
  // counts above wouldn't reveal.
  it("spot-checks exact prices against the source document", () => {
    const byName = new Map(printingCatalog.map((p) => [p.name, p]));

    const avisoAcrilico = byName.get("Aviso en acrílico");
    expect(avisoAcrilico?.variants?.find((v) => v.name.includes("3D + luces LED"))?.unitPrice).toBe(160000000);

    const agendas = byName.get("Agendas corporativas");
    const modelo3 = agendas?.variants?.find((v) => v.name.startsWith("Modelo 3"));
    expect(modelo3?.tiers?.find((t) => t.quantity === 50)?.unitPrice).toBe(2400000);

    const papelAntiGrasa = byName.get("Papel anti grasa");
    expect(papelAntiGrasa?.variants?.[0]?.tiers?.[0]?.flatTotalPrice).toBe(40000000);

    const stickersHolograficos = byName.get("Stickers holográficos");
    const variant3x3 = stickersHolograficos?.variants?.find((v) => v.name === "3x3 cm");
    expect(variant3x3?.packageQuantity).toBe(480);
    expect(variant3x3?.packageTotalPrice).toBe(7000000);

    const volantes = byName.get("Volantes");
    const tirajeCorto = volantes?.variants?.find((v) => v.name.startsWith("Tiraje corto"));
    expect(tirajeCorto?.tiers?.find((t) => t.quantity === 600)?.flatTotalPrice).toBe(52000000);
  });
});
