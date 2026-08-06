import type { PricingMode } from "@/lib/services/ports";

/**
 * A DELIBERATELY tiny sample of the commercial catalog — one product per
 * free-quantity-vs-constrained pricing shape that actually needs variants
 * (`variant`, `package`, `tiered`). Just enough to exercise the quote
 * builder's picker in mock/dev without seeding the real printing catalog
 * (`docs/printing/catalogo/printing.md`) here — that is a DB-only script
 * (`scripts/seed-printing-catalog.ts`), NOT this fixture.
 *
 * IMPORTANT: the mock store round-trips through a ~4KB httpOnly cookie (see
 * `lib/mock/cookie-persistence.ts`). A large fixture set here would silently
 * blow that budget, so this file stays at 3 products / a handful of
 * variants+tiers total — do not grow it without re-checking the serialized
 * cookie size.
 */

export type CatalogPriceTierFixture = {
  id: string;
  quantity: number;
  unitPrice?: number;
  flatTotalPrice?: number;
};

export type CatalogVariantFixture = {
  id: string;
  name: string;
  description?: string | null;
  unitPrice?: number;
  packageQuantity?: number;
  packageTotalPrice?: number;
  tiers?: CatalogPriceTierFixture[];
};

export type CatalogProductFixture = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  pricingMode: PricingMode;
  minOrderQuantity?: number;
  fixedUnitPrice?: number;
  areaBasePrice?: number;
  areaRatePerM2?: number;
  areaMinPrice?: number;
  variants?: CatalogVariantFixture[];
};

export const catalogProductFixtures: CatalogProductFixture[] = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    name: "Aviso en acrílico",
    category: "Avisos",
    description: "Aviso corporativo en acrílico, tamaño a elección.",
    pricingMode: "variant",
    variants: [
      {
        id: "b0000000-0000-4000-8000-000000000002",
        name: "150x55 cm",
        unitPrice: 18000000, // $180.000 COP
      },
      {
        id: "b0000000-0000-4000-8000-000000000003",
        name: "200x70 cm",
        unitPrice: 26000000, // $260.000 COP
      },
    ],
  },
  {
    id: "b0000000-0000-4000-8000-000000000004",
    name: "Stickers troquelados",
    category: "Stickers",
    description: "Stickers troquelados de corte, venta por paquete cerrado.",
    pricingMode: "package",
    variants: [
      {
        id: "b0000000-0000-4000-8000-000000000005",
        name: "3x3 cm",
        packageQuantity: 750,
        packageTotalPrice: 6000000, // $60.000 COP por paquete de 750
      },
    ],
  },
  {
    id: "b0000000-0000-4000-8000-000000000006",
    name: "Agendas personalizadas",
    category: "Papelería",
    description: "Agendas con logo, escalonadas por cantidad.",
    pricingMode: "tiered",
    variants: [
      {
        id: "b0000000-0000-4000-8000-000000000007",
        name: "Tapa dura",
        tiers: [
          { id: "b0000000-0000-4000-8000-000000000008", quantity: 12, unitPrice: 2000000 }, // $20.000 c/u
          { id: "b0000000-0000-4000-8000-000000000009", quantity: 24, unitPrice: 1600000 }, // $16.000 c/u
        ],
      },
    ],
  },
];
