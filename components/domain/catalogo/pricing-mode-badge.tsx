import { Badge } from "@/components/ui/badge";
import type { PricingMode } from "@/lib/services/ports";

/**
 * Spanish display labels for `PricingMode`
 * (`migrations/1700000016000_add_catalog_products.sql`'s header comment),
 * shared between this badge, the Catálogo list/detail pages and the
 * pricing-mode `<Select>` in `catalog-product-form-content.tsx`.
 */
export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  fixed: "Precio fijo",
  variant: "Variantes",
  package: "Paquetes",
  tiered: "Escalonado",
  area: "Por área",
};

export type PricingModeBadgeProps = {
  mode: PricingMode;
  className?: string;
};

/**
 * A `pricingMode` is a categorical/identity facet of a catalog product, not
 * an "attention" state (paid/overdue/low-stock, ...) — per `DESIGN.md`'s
 * "Estados por tabla" convention, identity booleans/enums that are not
 * warnings stay neutral (`outline`), not colored.
 */
export function PricingModeBadge({ mode, className }: PricingModeBadgeProps) {
  return (
    <Badge variant="outline" className={className}>
      {PRICING_MODE_LABELS[mode]}
    </Badge>
  );
}
