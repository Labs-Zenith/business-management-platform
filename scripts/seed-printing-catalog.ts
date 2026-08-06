import { parseArgs } from "node:util";
import { repositories } from "@/lib/services/repositories";
import { isDbConfigured } from "@/lib/db/client";
import type {
  CatalogProductCreate,
  CatalogVariantCreate,
  CatalogPriceTierCreate,
  PricingMode,
} from "@/lib/services/ports";

/**
 * Seeds the "Printing / Da House" print-shop catalog
 * (`docs/printing/catalogo/printing.md`) into an existing business's
 * commercial catalog (`catalog_products` and its children — see
 * `migrations/1700000016000_add_catalog_products.sql` for the five
 * `pricing_mode` shapes this seed produces).
 *
 * Run with the DB env loaded:
 *
 *   npx tsx --env-file=.env.local scripts/seed-printing-catalog.ts --business-id <uuid>
 *
 * TRANSCRIBED, NOT PARSED: `PRINTING_CATALOG_PESOS` below is hand-typed from
 * the markdown, not derived from it at runtime. The source document's own
 * "Notas sobre la extracción" section flags several OCR judgment calls
 * (normalized extra zeros on págs. 8/9/10, one inferred heading on pág. 27,
 * a likely duplicate quantity on pág. 3) that a regex/markdown-table parser
 * would either re-encode as fragile pattern matching or silently mis-seed —
 * those resolutions are honored verbatim here instead.
 *
 * MONEY: every price below is written in whole COP PESOS, exactly as printed
 * in the source ("$1.600.000" -> 1600000), so a human can eyeball this file
 * directly against the markdown. `toCents` (below) is the SINGLE site that
 * multiplies by 100 to produce the integer-cent `CatalogProductCreate[]` that
 * actually gets persisted — see `lib/money.ts`'s "integer minor units end to
 * end" convention. Every catalog price is a whole number of pesos (no
 * fractional-peso prices anywhere in the source), so a plain `* 100` is exact
 * — no float-rounding helper (`pesosToCents`) is needed here.
 *
 * IDEMPOTENT: `catalog_products` has `UNIQUE (business_id, name)`. This
 * script lists all existing catalog products for the business up front,
 * matches this file's products by `name`, and calls
 * `repositories.productCatalog.update` for a match or `.create` otherwise —
 * re-running is always safe and never duplicates a product.
 */

// ---------------------------------------------------------------------------
// Pesos-denominated literal shape (mirrors CatalogProductCreate/CatalogVariant
// Create/CatalogPriceTierCreate from lib/services/ports.ts, but every money
// field is whole pesos instead of cents — see the module doc comment above).
// ---------------------------------------------------------------------------

type PesosTier = {
  quantity: number;
  /** "Precio c/u" column tables. Exactly one of unitPrice/flatTotalPrice per tier. */
  unitPrice?: number;
  /** "Precio" (lump-sum) column tables. */
  flatTotalPrice?: number;
};

type PesosVariant = {
  name: string;
  /** Free text, usually "<material/finish> · pág. N" so a human can diff against the printed catalog. */
  description?: string;
  /** `variant` mode: price per unit, free quantity. */
  unitPrice?: number;
  /** `package` mode: units inside ONE closed package. */
  packageQuantity?: number;
  /** `package` mode: total price of ONE closed package. */
  packageTotalPrice?: number;
  /** `tiered` mode: the quantity ladder. */
  tiers?: PesosTier[];
};

type PesosProduct = {
  name: string;
  category: string;
  description?: string;
  pricingMode: PricingMode;
  /** Every product in this catalog has at least one variant — the source has no `fixed`/`area` products. */
  variants: PesosVariant[];
};

// ---------------------------------------------------------------------------
// The catalog literal — see docs/printing/catalogo/printing.md for the source.
// Populated section by section below, in the same order as the doc's Índice.
// ---------------------------------------------------------------------------

const PRINTING_CATALOG_PESOS: PesosProduct[] = [
  // ===========================================================================
  // Avisos (pág. 8-9, 23-24, 27)
  // ===========================================================================
  {
    name: "Aviso en acrílico",
    category: "Avisos",
    pricingMode: "variant",
    variants: [
      { name: "3D + luces LED · 150 x 55 cm", description: "Acrílico · pág. 8", unitPrice: 1600000 },
      { name: "Plano dorado espejo · 120 cm de ancho", description: "Acrílico · pág. 8", unitPrice: 350000 },
      {
        name: "Plano logo + letras · Logo 50 cm + letras 120 cm de ancho",
        description: "Acrílico · pág. 8",
        unitPrice: 600000,
      },
      { name: "Circular · 60 cm radial", description: "Acrílico · pág. 9", unitPrice: 500000 },
      {
        name: "MDF 9 mm + luces + letras en acrílico · 60 cm radial",
        description: "MDF 9 mm / acrílico · pág. 9",
        unitPrice: 450000,
      },
      {
        name: "Fondo acrílico + letras 3D + luces LED · 120 x 50 cm",
        description: "Acrílico · pág. 24",
        unitPrice: 1200000,
      },
      {
        name: "Fondo acrílico + letras 3D + luces LED · 150 x 50 cm",
        description: "Acrílico · pág. 24",
        unitPrice: 1500000,
      },
      {
        name: "Fondo acrílico + letras 3D + luces LED · 180 x 50 cm",
        description: "Acrílico · pág. 24",
        unitPrice: 1650000,
      },
      {
        name: "Fondo acrílico + letras 3D + luces LED · 220 x 50 cm",
        description: "Acrílico · pág. 24",
        unitPrice: 1800000,
      },
      {
        name: "Fondo acrílico + letras 3D + luces LED · 250 x 50 cm",
        description: "Acrílico · pág. 24",
        unitPrice: 1950000,
      },
      {
        name: "Fondo acrílico + letras 3D + luces LED · 350 x 50 cm",
        description: "Acrílico · pág. 24",
        unitPrice: 2600000,
      },
      {
        name: "Fondo acrílico + letras 3D + luces LED · 500 x 50 cm",
        description: "Acrílico · pág. 24",
        unitPrice: 3400000,
      },
    ],
  },
  {
    name: "Aviso tipo bandera",
    category: "Avisos",
    pricingMode: "variant",
    variants: [
      {
        name: "Estático, doble cara, acrílico + impresión · 40 cm radial",
        description: "Acrílico · pág. 23",
        unitPrice: 600000,
      },
      {
        name: "Giratorio, doble cara, acrílico + impresión · 40 cm radial",
        description: "Acrílico · pág. 23",
        unitPrice: 750000,
      },
    ],
  },
  {
    name: "Letras en acrílico volumétricas",
    category: "Avisos",
    pricingMode: "variant",
    variants: [
      { name: "Sin luces, grosor 5 cm · 30 cm", description: "Acrílico · pág. 27", unitPrice: 65000 },
      { name: "Sin luces, grosor 5 cm · 40 cm", description: "Acrílico · pág. 27", unitPrice: 90000 },
      { name: "Sin luces, grosor 5 cm · 50 cm", description: "Acrílico · pág. 27", unitPrice: 120000 },
      {
        name: "Con luces (inferido) · 30 cm",
        description:
          "Acrílico · pág. 27 · encabezado no venía en el OCR original, inferido como \"con luces\" (ver Notas sobre la extracción)",
        unitPrice: 120000,
      },
      {
        name: "Con luces (inferido) · 40 cm",
        description: "Acrílico · pág. 27 · encabezado inferido (ver Notas sobre la extracción)",
        unitPrice: 170000,
      },
      {
        name: "Con luces (inferido) · 50 cm",
        description: "Acrílico · pág. 27 · encabezado inferido (ver Notas sobre la extracción)",
        unitPrice: 210000,
      },
    ],
  },

  // ===========================================================================
  // Corporativo (pág. 12, 21, 22, 29, 30, 31)
  // ===========================================================================
  {
    name: "Agendas corporativas",
    category: "Corporativo",
    pricingMode: "tiered",
    variants: [
      {
        name: "Modelo 1 · 70 hojas rayadas · 10,5 x 14 cm",
        description: "Pedido mínimo: 12 unds · pág. 12",
        tiers: [
          { quantity: 12, unitPrice: 20000 },
          { quantity: 24, unitPrice: 16000 },
          { quantity: 36, unitPrice: 15000 },
          { quantity: 50, unitPrice: 14000 },
        ],
      },
      {
        name: "Modelo 2 · 95 hojas rayadas · 12,5 x 19 cm",
        description: "Pedido mínimo: 12 unds · pág. 12",
        tiers: [
          { quantity: 12, unitPrice: 23000 },
          { quantity: 24, unitPrice: 19000 },
          { quantity: 36, unitPrice: 18000 },
          { quantity: 50, unitPrice: 17000 },
        ],
      },
      {
        name: "Modelo 3 · 100 hojas rayadas · 20 x 20 cm",
        description: "Pedido mínimo: 12 unds · pág. 12",
        tiers: [
          { quantity: 12, unitPrice: 28000 },
          { quantity: 24, unitPrice: 26000 },
          { quantity: 36, unitPrice: 25000 },
          { quantity: 50, unitPrice: 24000 },
        ],
      },
    ],
  },
  {
    name: "Cartas menú",
    category: "Corporativo",
    pricingMode: "tiered",
    variants: [
      {
        name: "Vinilo impreso ambas caras + laminado kiko pack calibre 80 · 33 x 40 cm",
        description: "Vinilo / kiko pack · Pedido mínimo: 12 unds · Entrega: 3 días hábiles · pág. 30",
        tiers: [
          { quantity: 12, unitPrice: 45000 },
          { quantity: 24, unitPrice: 40000 },
          { quantity: 36, unitPrice: 37000 },
          { quantity: 48, unitPrice: 34000 },
        ],
      },
      {
        name: "Vinilo impreso ambas caras + laminado kiko pack calibre 80 · 22 x 28 cm",
        description: "Vinilo / kiko pack · Pedido mínimo: 12 unds · Entrega: 3 días hábiles · pág. 30",
        tiers: [
          { quantity: 12, unitPrice: 35000 },
          { quantity: 24, unitPrice: 30000 },
          { quantity: 36, unitPrice: 28000 },
          { quantity: 48, unitPrice: 25000 },
        ],
      },
    ],
  },
  {
    name: "Pines corporativos",
    category: "Corporativo",
    pricingMode: "tiered",
    variants: [
      {
        name: "Acrílico + impresión full color",
        description: "Acrílico · Pedido mínimo: 50 unds · Entrega: 5 días hábiles · pág. 22",
        tiers: [
          { quantity: 50, unitPrice: 6000 },
          { quantity: 100, unitPrice: 5500 },
          { quantity: 200, unitPrice: 5000 },
          { quantity: 300, unitPrice: 4000 },
        ],
      },
    ],
  },
  {
    name: "Portavasos personalizados",
    category: "Corporativo",
    pricingMode: "tiered",
    variants: [
      {
        name: "Cartón ecológico · 10 cm radial",
        description: "Pedido mínimo: 1.000 unds · pág. 31",
        tiers: [
          { quantity: 1000, unitPrice: 400 },
          { quantity: 3000, unitPrice: 200 },
          { quantity: 6000, unitPrice: 150 },
        ],
      },
    ],
  },
  {
    name: "QR en acrílico",
    category: "Corporativo",
    pricingMode: "tiered",
    variants: [
      {
        name: "Acrílico + impresión full color · 8 x 8 cm",
        description: "Acrílico · Pedido mínimo: 12 unds · Entrega: 2 días hábiles · pág. 21",
        tiers: [
          { quantity: 12, unitPrice: 12000 },
          { quantity: 24, unitPrice: 8500 },
          { quantity: 36, unitPrice: 8000 },
          { quantity: 50, unitPrice: 7500 },
        ],
      },
    ],
  },
  {
    name: "QR en madera - grande",
    category: "Corporativo",
    pricingMode: "tiered",
    variants: [
      {
        name: "Acrílico grande · 11,5 x 16,5 cm",
        description: "Madera / acrílico · Pedido mínimo: 12 unds · Entrega: 5 días hábiles · pág. 29",
        tiers: [
          { quantity: 12, unitPrice: 38000 },
          { quantity: 24, unitPrice: 35000 },
          { quantity: 36, unitPrice: 32000 },
          { quantity: 48, unitPrice: 30000 },
        ],
      },
    ],
  },
  {
    name: "QR en madera - pequeño",
    category: "Corporativo",
    pricingMode: "tiered",
    variants: [
      {
        name: "Acrílico pequeño · 9 x 12 cm",
        description: "Madera / acrílico · Pedido mínimo: 12 unds · Entrega: 5 días hábiles · pág. 29",
        tiers: [
          { quantity: 12, unitPrice: 30000 },
          { quantity: 24, unitPrice: 26000 },
          { quantity: 36, unitPrice: 24000 },
          { quantity: 48, unitPrice: 22000 },
        ],
      },
    ],
  },

  // ===========================================================================
  // Decoración (pág. 25)
  // ===========================================================================
  {
    name: "Retablos",
    category: "Decoración",
    pricingMode: "variant",
    variants: [
      { name: "Rectangular · 15 x 20 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 20000 },
      { name: "Rectangular · 20 x 30 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 25000 },
      { name: "Rectangular · 20 x 40 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 30000 },
      { name: "Rectangular · 30 x 40 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 40000 },
      { name: "Rectangular · 30 x 50 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 55000 },
      { name: "Rectangular · 30 x 60 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 60000 },
      { name: "Rectangular · 40 x 50 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 65000 },
      { name: "Rectangular · 40 x 60 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 70000 },
      {
        name: "Rectangular · 50 x 70 cm",
        description: "MDF 9 mm + vinilo laminado mate · pág. 25",
        unitPrice: 100000,
      },
      {
        name: "Rectangular · 60 x 80 cm",
        description: "MDF 9 mm + vinilo laminado mate · pág. 25",
        unitPrice: 110000,
      },
      {
        name: "Rectangular · 70 x 100 cm",
        description: "MDF 9 mm + vinilo laminado mate · pág. 25",
        unitPrice: 160000,
      },
      { name: "Cuadrado · 20 x 20 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 20000 },
      { name: "Cuadrado · 30 x 30 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 30000 },
      { name: "Cuadrado · 40 x 40 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 60000 },
      { name: "Cuadrado · 50 x 50 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 70000 },
      { name: "Cuadrado · 80 x 80 cm", description: "MDF 9 mm + vinilo laminado mate · pág. 25", unitPrice: 130000 },
      {
        name: "Cuadrado · 100 x 100 cm",
        description: "MDF 9 mm + vinilo laminado mate · pág. 25",
        unitPrice: 170000,
      },
    ],
  },

  // ===========================================================================
  // Empaque (pág. 16, 19, 28)
  // ===========================================================================
  {
    name: "Cajas en cartón multifuncional",
    category: "Empaque",
    pricingMode: "tiered",
    variants: [
      {
        name: "2 tintas, plastificado brillante · 9 alto x 20,5 ancho x 14,5 prof. cm",
        description: "Cartón calibre 18 · Pedido mínimo: 500 unds · pág. 16",
        tiers: [
          { quantity: 500, unitPrice: 2600 },
          { quantity: 1000, unitPrice: 1800 },
        ],
      },
    ],
  },
  {
    name: "Papel anti grasa",
    category: "Empaque",
    pricingMode: "tiered",
    variants: [
      {
        name: "Papel anti grasa",
        description: "Pedido mínimo: 1.000 unds · Entrega: 3 días hábiles · pág. 28",
        tiers: [{ quantity: 1000, flatTotalPrice: 400000 }],
      },
    ],
  },
  {
    name: "Papel envolvente",
    category: "Empaque",
    pricingMode: "tiered",
    variants: [
      {
        name: "Bond 65 gr. · 50 x 35 cm",
        description: "Pedido mínimo: 300 unds · pág. 19",
        tiers: [
          { quantity: 300, flatTotalPrice: 250000 },
          { quantity: 500, flatTotalPrice: 320000 },
          { quantity: 1000, flatTotalPrice: 400000 },
        ],
      },
    ],
  },

  // ===========================================================================
  // Papelería (pág. 2, 4, 11, 13, 15, 19)
  // ===========================================================================
  {
    name: "Etiquetas",
    category: "Papelería",
    pricingMode: "tiered",
    variants: [
      {
        name: "Full color, impresas x ambas caras · 10 x 7 cm",
        description: "Pedido mínimo: 100 unds · pág. 11",
        tiers: [
          { quantity: 100, flatTotalPrice: 100000 },
          { quantity: 200, flatTotalPrice: 180000 },
          { quantity: 300, flatTotalPrice: 250000 },
          { quantity: 400, flatTotalPrice: 300000 },
          { quantity: 500, flatTotalPrice: 360000 },
        ],
      },
    ],
  },
  {
    name: "Membretes",
    category: "Papelería",
    pricingMode: "tiered",
    variants: [
      {
        name: "Full color · Bond 75 gr.",
        description: "Pedido mínimo: 1.000 unds · Entrega: 3 días hábiles · pág. 15",
        tiers: [{ quantity: 1000, flatTotalPrice: 350000 }],
      },
    ],
  },
  {
    name: "Postales",
    category: "Papelería",
    pricingMode: "tiered",
    variants: [
      {
        name: "Full color, impresas x una sola cara · Propalcote 300 gr. · 10 x 15 cm",
        description: "Pedido mínimo: 100 unds · Entrega: 1 día hábil · pág. 4",
        tiers: [
          { quantity: 100, flatTotalPrice: 70000 },
          { quantity: 200, flatTotalPrice: 120000 },
          { quantity: 300, flatTotalPrice: 160000 },
          { quantity: 400, flatTotalPrice: 220000 },
          { quantity: 500, flatTotalPrice: 260000 },
        ],
      },
      {
        name: "Full color, impresas ambos lados · Propalcote 300 gr. · 10 x 15 cm",
        description:
          "Pedido mínimo: 100 unds · pág. 19 · distinto del producto de pág. 4 (una sola cara) — ambos son productos legítimos del catálogo, ver Notas sobre la extracción",
        tiers: [
          { quantity: 100, flatTotalPrice: 130000 },
          { quantity: 300, flatTotalPrice: 350000 },
          { quantity: 1000, flatTotalPrice: 450000 },
        ],
      },
    ],
  },
  {
    name: "Talonarios",
    category: "Papelería",
    pricingMode: "package",
    variants: [
      {
        name: "10 x 15 cm",
        description: "1 tinta, numerados, 100 hojas c/u (50 original + 50 copia) · pág. 13",
        packageQuantity: 20,
        packageTotalPrice: 160000,
      },
      {
        name: "14 x 21 cm",
        description: "1 tinta, numerados, 100 hojas c/u (50 original + 50 copia) · pág. 13",
        packageQuantity: 20,
        packageTotalPrice: 295000,
      },
      {
        name: "22 x 28 cm",
        description: "1 tinta, numerados, 100 hojas c/u (50 original + 50 copia) · pág. 13",
        packageQuantity: 20,
        packageTotalPrice: 380000,
      },
    ],
  },
  {
    name: "Tarjetas de presentación",
    category: "Papelería",
    pricingMode: "tiered",
    variants: [
      {
        name: "Full color, impresas x ambas caras · Propalcote 300 gr. · 9 x 5,5 cm",
        description: "Pedido mínimo: 100 unds · Entrega: 1 día hábil · pág. 2",
        tiers: [
          { quantity: 100, flatTotalPrice: 60000 },
          { quantity: 200, flatTotalPrice: 80000 },
          { quantity: 300, flatTotalPrice: 110000 },
          { quantity: 400, flatTotalPrice: 140000 },
          { quantity: 500, flatTotalPrice: 160000 },
        ],
      },
      {
        name: "Full color, ambas caras, plastificado mate con reserva UV · Propalcote 300 gr.",
        description: "Pedido mínimo: 1.000 unds · Entrega: 3 días hábiles · pág. 2",
        tiers: [{ quantity: 1000, flatTotalPrice: 170000 }],
      },
    ],
  },

  // ===========================================================================
  // Publicidad exterior (pág. 10, 32)
  // ===========================================================================
  {
    name: "Araña",
    category: "Publicidad exterior",
    pricingMode: "variant",
    variants: [{ name: "2 m alto x 1 m ancho", description: "pág. 10", unitPrice: 250000 }],
  },
  {
    name: "Banderas personalizadas",
    category: "Publicidad exterior",
    pricingMode: "variant",
    variants: [
      { name: "Base tanque · 180 cm de alto", description: "pág. 32", unitPrice: 450000 },
      { name: "Base tanque · 280 cm de alto", description: "pág. 32", unitPrice: 650000 },
      { name: "Base tanque · 340 cm de alto", description: "pág. 32", unitPrice: 720000 },
      { name: "Base tanque · 450 cm de alto", description: "pág. 32", unitPrice: 750000 },
    ],
  },
  {
    name: "Roll up",
    category: "Publicidad exterior",
    pricingMode: "variant",
    variants: [{ name: "2 m alto x 1 m ancho", description: "pág. 10", unitPrice: 280000 }],
  },

  // ===========================================================================
  // Publicidad impresa (pág. 7, 14)
  // ===========================================================================
  {
    name: "Brochures",
    category: "Publicidad impresa",
    pricingMode: "tiered",
    variants: [
      {
        name: "Full color, ambas caras, carta abierto · Propalcote 150 gr. · Carta abierto",
        description: "Pedido mínimo: 50 unds · pág. 14",
        tiers: [
          { quantity: 50, flatTotalPrice: 250000 },
          { quantity: 100, flatTotalPrice: 380000 },
          { quantity: 1000, flatTotalPrice: 750000 },
        ],
      },
    ],
  },
  {
    name: "Volantes",
    category: "Publicidad impresa",
    pricingMode: "tiered",
    variants: [
      {
        name: "Tiraje corto · 14 x 21 cm",
        description:
          "Pedido mínimo: 100 unds · Entrega: 1 día hábil · pág. 7 · el tiraje de 100 a 600 no indica material/gramaje en el original (ver Notas sobre la extracción)",
        tiers: [
          { quantity: 100, flatTotalPrice: 100000 },
          { quantity: 200, flatTotalPrice: 190000 },
          { quantity: 300, flatTotalPrice: 280000 },
          { quantity: 400, flatTotalPrice: 380000 },
          { quantity: 500, flatTotalPrice: 420000 },
          { quantity: 600, flatTotalPrice: 520000 },
        ],
      },
      {
        name: "Full color, una sola cara · Propalcote 115 gr. brillante · 14 x 21 cm",
        description: "Pedido mínimo: 1.000 unds · Entrega: 3 días hábiles · pág. 7",
        tiers: [
          { quantity: 1000, flatTotalPrice: 170000 },
          { quantity: 3000, flatTotalPrice: 400000 },
          { quantity: 5000, flatTotalPrice: 700000 },
        ],
      },
      {
        name: "Full color, ambas caras · Propalcote 150 gr. brillante · 14 x 21 cm",
        description: "Pedido mínimo: 1.000 unds · Entrega: 3 días hábiles · pág. 7",
        tiers: [
          { quantity: 1000, flatTotalPrice: 270000 },
          { quantity: 3000, flatTotalPrice: 750000 },
          { quantity: 5000, flatTotalPrice: 1150000 },
        ],
      },
    ],
  },

  // ===========================================================================
  // Señalización (pág. 17)
  // ===========================================================================
  {
    name: "Señales corporativas",
    category: "Señalización",
    pricingMode: "tiered",
    variants: [
      {
        name: "Kiko pack + vinilo laminado + cinta doble faz · 40 x 25 cm",
        description: "Kiko pack / vinilo · Pedido mínimo: 12 unds · pág. 17",
        tiers: [
          { quantity: 12, unitPrice: 30000 },
          { quantity: 24, unitPrice: 28000 },
          { quantity: 36, unitPrice: 26000 },
          { quantity: 50, unitPrice: 24000 },
        ],
      },
      {
        name: "Kiko pack + vinilo laminado + cinta doble faz · 30 x 12,5 cm",
        description: "Kiko pack / vinilo · Pedido mínimo: 12 unds · pág. 17",
        tiers: [
          { quantity: 12, unitPrice: 28000 },
          { quantity: 24, unitPrice: 25000 },
          { quantity: 36, unitPrice: 23000 },
          { quantity: 50, unitPrice: 21000 },
        ],
      },
      {
        name: "Kiko pack + vinilo laminado + cinta doble faz · 32 x 18 cm",
        description: "Kiko pack / vinilo · Pedido mínimo: 12 unds · pág. 17",
        tiers: [
          { quantity: 12, unitPrice: 29000 },
          { quantity: 24, unitPrice: 26000 },
          { quantity: 36, unitPrice: 24000 },
          { quantity: 50, unitPrice: 22000 },
        ],
      },
    ],
  },

  // ===========================================================================
  // Stickers (pág. 3, 5, 6, 18, 20, 26)
  // ===========================================================================
  {
    name: "Hoja de stickers",
    category: "Stickers",
    pricingMode: "package",
    variants: [
      {
        name: "22 x 28 cm",
        description: "Máx. 6 stickers por hoja (9 si son circulares) · Entrega: 2 días hábiles · pág. 20",
        packageQuantity: 12,
        packageTotalPrice: 80000,
      },
      {
        name: "14 x 21 cm",
        description: "Máx. 6 stickers por hoja (9 si son circulares) · Entrega: 2 días hábiles · pág. 20",
        packageQuantity: 28,
        packageTotalPrice: 80000,
      },
      {
        name: "10 x 14 cm",
        description: "Máx. 6 stickers por hoja (9 si son circulares) · Entrega: 2 días hábiles · pág. 20",
        packageQuantity: 60,
        packageTotalPrice: 80000,
      },
      {
        name: "10 x 10 cm",
        description: "Máx. 6 stickers por hoja (9 si son circulares) · Entrega: 2 días hábiles · pág. 20",
        packageQuantity: 80,
        packageTotalPrice: 80000,
      },
    ],
  },
  {
    name: "Rótulos de envío adhesivos",
    category: "Stickers",
    pricingMode: "tiered",
    variants: [
      {
        name: "Full color, impresas x una sola cara, corte incluido · 7,5 x 10 cm",
        description: "Adhesivo papel · Pedido mínimo: 100 unds · pág. 5",
        tiers: [
          { quantity: 100, flatTotalPrice: 50000 },
          { quantity: 200, flatTotalPrice: 75000 },
          { quantity: 300, flatTotalPrice: 95000 },
          { quantity: 400, flatTotalPrice: 130000 },
          { quantity: 500, flatTotalPrice: 170000 },
        ],
      },
    ],
  },
  {
    name: "Stickers UV DTF",
    category: "Stickers",
    pricingMode: "variant",
    variants: [
      { name: "UV DTF · 58 x 30 cm", description: "pág. 26", unitPrice: 80000 },
      { name: "UV DTF · 58 x 50 cm", description: "pág. 26", unitPrice: 120000 },
      { name: "UV DTF · 58 x 100 cm", description: "pág. 26", unitPrice: 170000 },
    ],
  },
  {
    name: "Stickers holográficos",
    category: "Stickers",
    pricingMode: "package",
    variants: [
      {
        name: "3x3 cm",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 18",
        packageQuantity: 480,
        packageTotalPrice: 70000,
      },
      {
        name: "4x4 cm",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 18",
        packageQuantity: 280,
        packageTotalPrice: 70000,
      },
      {
        name: "5x5 cm",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 18",
        packageQuantity: 170,
        packageTotalPrice: 70000,
      },
      {
        name: "6x6 cm",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 18",
        packageQuantity: 115,
        packageTotalPrice: 70000,
      },
      {
        name: "7x7 cm",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 18",
        packageQuantity: 85,
        packageTotalPrice: 70000,
      },
      {
        name: "8x8 cm",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 18",
        packageQuantity: 60,
        packageTotalPrice: 70000,
      },
    ],
  },
  {
    name: "Stickers publicitarios",
    category: "Stickers",
    pricingMode: "package",
    variants: [
      {
        name: "2x2 cm (adhesivo vinilo)",
        description: "Corte incluido · Adhesivo vinilo · pág. 3",
        packageQuantity: 228,
        packageTotalPrice: 25000,
      },
      {
        name: "3x3 cm (adhesivo vinilo)",
        description: "Corte incluido · Adhesivo vinilo · pág. 3",
        packageQuantity: 104,
        packageTotalPrice: 25000,
      },
      {
        name: "4x4 cm (adhesivo vinilo)",
        description: "Corte incluido · Adhesivo vinilo · pág. 3",
        packageQuantity: 54,
        packageTotalPrice: 25000,
      },
      {
        name: "5x5 cm (adhesivo vinilo)",
        description: "Corte incluido · Adhesivo vinilo · pág. 3",
        packageQuantity: 40,
        packageTotalPrice: 25000,
      },
      {
        name: "6x6 cm (adhesivo vinilo)",
        description: "Corte incluido · Adhesivo vinilo · pág. 3",
        packageQuantity: 24,
        packageTotalPrice: 25000,
      },
      {
        name: "7x7 cm (adhesivo vinilo)",
        description:
          "Corte incluido · Adhesivo vinilo · pág. 3 · el original muestra 15 unds también para 8x8 cm; posible error del catálogo (ver Notas sobre la extracción)",
        packageQuantity: 15,
        packageTotalPrice: 25000,
      },
      {
        name: "8x8 cm (adhesivo vinilo)",
        description:
          "Corte incluido · Adhesivo vinilo · pág. 3 · el original muestra 15 unds también para 7x7 cm; posible error del catálogo (ver Notas sobre la extracción)",
        packageQuantity: 15,
        packageTotalPrice: 25000,
      },
      {
        name: "3x3 cm (vinilo resistente)",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 6",
        packageQuantity: 750,
        packageTotalPrice: 60000,
      },
      {
        name: "4x4 cm (vinilo resistente)",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 6",
        packageQuantity: 430,
        packageTotalPrice: 60000,
      },
      {
        name: "5x5 cm (vinilo resistente)",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 6",
        packageQuantity: 270,
        packageTotalPrice: 60000,
      },
      {
        name: "6x6 cm (vinilo resistente)",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 6",
        packageQuantity: 190,
        packageTotalPrice: 60000,
      },
      {
        name: "7x7 cm (vinilo resistente)",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 6",
        packageQuantity: 140,
        packageTotalPrice: 60000,
      },
      {
        name: "8x8 cm (vinilo resistente)",
        description: "Corte incluido, resistentes a humedad y calor · Vinilo · pág. 6",
        packageQuantity: 120,
        packageTotalPrice: 60000,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Single pesos -> cents conversion site.
// ---------------------------------------------------------------------------

function toCents(pesos: number): number {
  return pesos * 100;
}

function convertTier(tier: PesosTier): CatalogPriceTierCreate {
  if (tier.unitPrice !== undefined && tier.flatTotalPrice !== undefined) {
    throw new Error(`Tier at quantity ${tier.quantity} has both unitPrice and flatTotalPrice set.`);
  }
  if (tier.unitPrice !== undefined) {
    return { quantity: tier.quantity, unitPrice: toCents(tier.unitPrice) };
  }
  if (tier.flatTotalPrice !== undefined) {
    return { quantity: tier.quantity, flatTotalPrice: toCents(tier.flatTotalPrice) };
  }
  throw new Error(`Tier at quantity ${tier.quantity} has neither unitPrice nor flatTotalPrice set.`);
}

function convertVariant(variant: PesosVariant, sortOrder: number): CatalogVariantCreate {
  return {
    name: variant.name,
    description: variant.description ?? null,
    sortOrder,
    unitPrice: variant.unitPrice !== undefined ? toCents(variant.unitPrice) : undefined,
    packageQuantity: variant.packageQuantity,
    packageTotalPrice: variant.packageTotalPrice !== undefined ? toCents(variant.packageTotalPrice) : undefined,
    tiers: variant.tiers ? variant.tiers.map(convertTier) : undefined,
  };
}

function convertProduct(product: PesosProduct): CatalogProductCreate {
  return {
    name: product.name,
    category: product.category,
    description: product.description ?? null,
    pricingMode: product.pricingMode,
    variants: product.variants.map(convertVariant),
  };
}

/** The transcribed catalog, converted to integer COP cents — this is what gets seeded and what the test imports. */
export const printingCatalog: CatalogProductCreate[] = PRINTING_CATALOG_PESOS.map(convertProduct);

/**
 * Counts "price options" the same way the source doc does: one per `variant`-
 * mode variant (a piece priced per unit), one per `package`-mode variant (a
 * closed package), one per `tiered`-mode tier rung, and one for each
 * `fixed`/`area` product (a single price on the product row itself — this
 * catalog has none, but the rule is included for completeness/reuse by the
 * test). Exported so the test asserts against the exact same counting rule
 * the seed summary prints, rather than a second hand-maintained copy that
 * could silently drift.
 */
export function countPriceOptions(product: CatalogProductCreate): number {
  if (product.pricingMode === "fixed" || product.pricingMode === "area") {
    return 1;
  }
  const variants = product.variants ?? [];
  if (product.pricingMode === "tiered") {
    return variants.reduce((sum, variant) => sum + (variant.tiers?.length ?? 0), 0);
  }
  // `variant` and `package` modes: exactly one price option per variant.
  return variants.length;
}

async function fetchExistingProductIdsByName(businessId: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const pageSize = 100;
  let page = 1;
  for (;;) {
    const result = await repositories.productCatalog.list(businessId, { page, pageSize });
    for (const product of result.data) {
      byName.set(product.name, product.id);
    }
    if (result.data.length === 0 || page * pageSize >= result.total) break;
    page++;
  }
  return byName;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "business-id": { type: "string" },
    },
  });

  const businessId = values["business-id"];
  if (!businessId) {
    console.error("[seed-printing-catalog] Missing --business-id <uuid>.");
    process.exit(1);
  }

  if (!isDbConfigured) {
    console.error("[seed-printing-catalog] No database configured (POSTGRES_URL/DATABASE_URL missing). Aborting.");
    process.exit(1);
  }

  const business = await repositories.business.getById(businessId);
  if (!business) {
    console.error(`[seed-printing-catalog] Business ${businessId} does not exist. Aborting.`);
    process.exit(1);
  }

  console.log(`[seed-printing-catalog] Seeding printing catalog into business "${business.name}" (${businessId})...`);

  const existingIdsByName = await fetchExistingProductIdsByName(businessId);

  let created = 0;
  let updated = 0;
  let priceOptionsSeeded = 0;

  for (const product of printingCatalog) {
    const existingId = existingIdsByName.get(product.name);
    if (existingId) {
      await repositories.productCatalog.update(businessId, existingId, product);
      updated++;
    } else {
      await repositories.productCatalog.create(businessId, product);
      created++;
    }
    priceOptionsSeeded += countPriceOptions(product);
  }

  console.log("[seed-printing-catalog] Done. Summary:");
  console.log(`  products created: ${created}`);
  console.log(`  products updated: ${updated}`);
  console.log(`  total products:   ${printingCatalog.length}`);
  console.log(`  price options seeded: ${priceOptionsSeeded}`);
}

// Guarded so importing this module (e.g. `printingCatalog`/`countPriceOptions`
// from `seed-printing-catalog.test.ts`, a pure-data test with NO database)
// never triggers a real run. Only executes when this file is the process
// entry point, i.e. run directly via `npx tsx scripts/seed-printing-catalog.ts`.
const isMainModule = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[seed-printing-catalog] Failed:", error);
      process.exit(1);
    });
}
