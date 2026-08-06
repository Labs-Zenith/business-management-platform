import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PricingMode } from "@/lib/services/ports";
import { PRICING_MODE_LABELS, PricingModeBadge } from "./pricing-mode-badge";

const MODES: PricingMode[] = ["fixed", "variant", "package", "tiered", "area"];

describe("PricingModeBadge", () => {
  it.each(MODES)("renders the Spanish label for '%s' mode", (mode) => {
    render(<PricingModeBadge mode={mode} />);
    expect(screen.getByText(PRICING_MODE_LABELS[mode])).toBeInTheDocument();
  });

  it("uses the neutral 'outline' badge variant — a pricing mode is an identity facet, not an attention state", () => {
    render(<PricingModeBadge mode="fixed" />);
    // `badge.tsx`'s `outline` variant applies `border-border text-foreground`
    // — matches `DESIGN.md`'s "Estados por tabla" convention for non-warning
    // identity booleans/enums (e.g. Activo/Inactivo's neutral `outline`).
    expect(screen.getByText("Precio fijo")).toHaveClass("border-border");
  });
});
