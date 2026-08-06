import { describe, expect, it } from "vitest";
import { catalogProductCreateSchema, catalogProductUpdateSchema } from "./catalog-product";

const FIXED_PAYLOAD = {
  name: "Volante A5",
  category: "Impresos",
  description: "Volante publicitario",
  pricingMode: "fixed" as const,
  fixedUnitPrice: 1500,
};

const AREA_PAYLOAD = {
  name: "Aviso en acrílico",
  pricingMode: "area" as const,
  areaBasePrice: 5000,
  areaRatePerM2: 80000,
};

const VARIANT_PAYLOAD = {
  name: "Aviso en acrílico 150x55",
  pricingMode: "variant" as const,
  variants: [{ name: "Estándar", unitPrice: 120000 }],
};

const PACKAGE_PAYLOAD = {
  name: "Stickers 3x3",
  pricingMode: "package" as const,
  variants: [{ name: "Paquete de 750", packageQuantity: 750, packageTotalPrice: 6000000 }],
};

const TIERED_PAYLOAD = {
  name: "Agendas",
  pricingMode: "tiered" as const,
  variants: [
    {
      name: "Estándar",
      tiers: [
        { quantity: 12, unitPrice: 2000000 },
        { quantity: 24, unitPrice: 1600000 },
      ],
    },
  ],
};

describe("catalogProductCreateSchema — fixed mode", () => {
  it("accepts a valid fixed payload", () => {
    expect(catalogProductCreateSchema.safeParse(FIXED_PAYLOAD).success).toBe(true);
  });

  it("rejects fixed mode missing fixedUnitPrice", () => {
    const { fixedUnitPrice: _drop, ...rest } = FIXED_PAYLOAD;
    expect(catalogProductCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects fixed mode carrying an area field", () => {
    expect(
      catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, areaBasePrice: 100 }).success,
    ).toBe(false);
  });

  it("rejects fixed mode carrying variants", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...FIXED_PAYLOAD,
        variants: [{ name: "x", unitPrice: 100 }],
      }).success,
    ).toBe(false);
  });
});

describe("catalogProductCreateSchema — area mode", () => {
  it("accepts a valid area payload, with optional areaMinPrice", () => {
    expect(catalogProductCreateSchema.safeParse(AREA_PAYLOAD).success).toBe(true);
    expect(
      catalogProductCreateSchema.safeParse({ ...AREA_PAYLOAD, areaMinPrice: 3000 }).success,
    ).toBe(true);
  });

  it("rejects area mode missing areaRatePerM2", () => {
    const { areaRatePerM2: _drop, ...rest } = AREA_PAYLOAD;
    expect(catalogProductCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects area mode carrying fixedUnitPrice", () => {
    expect(
      catalogProductCreateSchema.safeParse({ ...AREA_PAYLOAD, fixedUnitPrice: 100 }).success,
    ).toBe(false);
  });

  it("rejects area mode carrying variants", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...AREA_PAYLOAD,
        variants: [{ name: "x", unitPrice: 100 }],
      }).success,
    ).toBe(false);
  });
});

describe("catalogProductCreateSchema — variant mode", () => {
  it("accepts a valid variant payload", () => {
    expect(catalogProductCreateSchema.safeParse(VARIANT_PAYLOAD).success).toBe(true);
  });

  it("rejects variant mode with zero variants", () => {
    expect(
      catalogProductCreateSchema.safeParse({ ...VARIANT_PAYLOAD, variants: [] }).success,
    ).toBe(false);
  });

  it("rejects a variant missing unitPrice", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...VARIANT_PAYLOAD,
        variants: [{ name: "Estándar" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a variant that also carries package fields", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...VARIANT_PAYLOAD,
        variants: [{ name: "Estándar", unitPrice: 100, packageQuantity: 10, packageTotalPrice: 1000 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a variant that also carries tiers", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...VARIANT_PAYLOAD,
        variants: [{ name: "Estándar", unitPrice: 100, tiers: [{ quantity: 1, unitPrice: 100 }] }],
      }).success,
    ).toBe(false);
  });
});

describe("catalogProductCreateSchema — package mode", () => {
  it("accepts a valid package payload", () => {
    expect(catalogProductCreateSchema.safeParse(PACKAGE_PAYLOAD).success).toBe(true);
  });

  it("rejects a package variant missing packageTotalPrice", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...PACKAGE_PAYLOAD,
        variants: [{ name: "Paquete de 750", packageQuantity: 750 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a package variant that also carries unitPrice", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...PACKAGE_PAYLOAD,
        variants: [{ name: "x", packageQuantity: 750, packageTotalPrice: 6000000, unitPrice: 100 }],
      }).success,
    ).toBe(false);
  });
});

describe("catalogProductCreateSchema — tiered mode", () => {
  it("accepts a valid tiered payload", () => {
    expect(catalogProductCreateSchema.safeParse(TIERED_PAYLOAD).success).toBe(true);
  });

  it("rejects a tiered variant with zero tiers", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...TIERED_PAYLOAD,
        variants: [{ name: "Estándar", tiers: [] }],
      }).success,
    ).toBe(false);
  });

  it("rejects a tiered variant that also carries unitPrice", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...TIERED_PAYLOAD,
        variants: [{ name: "Estándar", unitPrice: 100, tiers: [{ quantity: 12, unitPrice: 100 }] }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate tier quantities within one variant", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...TIERED_PAYLOAD,
        variants: [
          {
            name: "Estándar",
            tiers: [
              { quantity: 12, unitPrice: 100 },
              { quantity: 12, unitPrice: 90 },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a tier with both unitPrice and flatTotalPrice", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...TIERED_PAYLOAD,
        variants: [
          { name: "Estándar", tiers: [{ quantity: 12, unitPrice: 100, flatTotalPrice: 200 }] },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a tier with neither unitPrice nor flatTotalPrice", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...TIERED_PAYLOAD,
        variants: [{ name: "Estándar", tiers: [{ quantity: 12 }] }],
      }).success,
    ).toBe(false);
  });

  it("accepts a flat-priced tier (no per-unit figure)", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...TIERED_PAYLOAD,
        variants: [{ name: "Estándar", tiers: [{ quantity: 12, flatTotalPrice: 500000 }] }],
      }).success,
    ).toBe(true);
  });
});

describe("catalogProductCreateSchema — general field rules", () => {
  it("rejects an unknown top-level field", () => {
    expect(catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, businessId: "x" }).success).toBe(false);
  });

  it("rejects an unknown field on a variant", () => {
    expect(
      catalogProductCreateSchema.safeParse({
        ...VARIANT_PAYLOAD,
        variants: [{ name: "x", unitPrice: 100, extra: true }],
      }).success,
    ).toBe(false);
  });

  it("rejects a negative money field", () => {
    expect(catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, fixedUnitPrice: -1 }).success).toBe(false);
  });

  it("rejects a non-integer money field", () => {
    expect(catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, fixedUnitPrice: 10.5 }).success).toBe(false);
  });

  it("accepts minOrderQuantity as a positive integer", () => {
    expect(
      catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, minOrderQuantity: 5 }).success,
    ).toBe(true);
  });

  it("rejects minOrderQuantity <= 0", () => {
    expect(
      catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, minOrderQuantity: 0 }).success,
    ).toBe(false);
  });

  it("rejects minOrderQuantity as a fractional value", () => {
    expect(
      catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, minOrderQuantity: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, name: "" }).success).toBe(false);
  });

  it("rejects an unknown pricingMode value", () => {
    expect(
      catalogProductCreateSchema.safeParse({ ...FIXED_PAYLOAD, pricingMode: "bogus" }).success,
    ).toBe(false);
  });
});

describe("catalogProductUpdateSchema", () => {
  it("accepts a bare { active } toggle with nothing else", () => {
    expect(catalogProductUpdateSchema.safeParse({ active: true }).success).toBe(true);
    expect(catalogProductUpdateSchema.safeParse({ active: false }).success).toBe(true);
  });

  it("rejects a bare { active } payload mixed with any other field", () => {
    expect(
      catalogProductUpdateSchema.safeParse({ active: true, name: "x" }).success,
    ).toBe(false);
  });

  it("accepts a full replacement payload (same shape as create) plus active", () => {
    expect(
      catalogProductUpdateSchema.safeParse({ ...FIXED_PAYLOAD, active: false }).success,
    ).toBe(true);
  });

  it("re-applies the same mode invariants on the full-replacement branch", () => {
    expect(
      catalogProductUpdateSchema.safeParse({
        name: "x",
        pricingMode: "fixed",
        // missing fixedUnitPrice
      }).success,
    ).toBe(false);
  });

  it("rejects a partial pricing edit missing 'name' (matches neither the active-only nor the full branch)", () => {
    expect(
      catalogProductUpdateSchema.safeParse({ pricingMode: "fixed", fixedUnitPrice: 100 }).success,
    ).toBe(false);
  });

  it("rejects an update payload missing name on the full branch", () => {
    expect(
      catalogProductUpdateSchema.safeParse({ pricingMode: "fixed", fixedUnitPrice: 100 }).success,
    ).toBe(false);
  });
});
