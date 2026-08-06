import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { CatalogVariantFields } from "./catalog-variant-fields";
import { defaultVariant, type CatalogProductFormValues } from "./catalog-product-form-schema";

/**
 * `CatalogVariantFields` is only ever rendered from
 * `catalog-product-form-content.tsx` in the real app, but its per-row price
 * PREVIEW (the "show the user what their configuration will actually
 * charge" requirement) is easiest to exercise directly against a bare
 * `useForm` host rather than through the full product form — this
 * complements `catalog-product-form-content.test.tsx`'s end-to-end submit
 * assertions, which don't inspect the live preview text.
 */
function Harness({ pricingMode }: { pricingMode: "variant" | "package" | "tiered" }) {
  const { control, register, formState } = useForm<CatalogProductFormValues>({
    defaultValues: {
      name: "",
      category: "",
      description: "",
      pricingMode,
      minOrderQuantity: "1",
      fixedUnitPrice: "",
      areaBasePrice: "",
      areaRatePerM2: "",
      areaMinPrice: "",
      active: true,
      variants: [defaultVariant()],
    },
  });

  return (
    <CatalogVariantFields control={control} register={register} errors={formState.errors} pricingMode={pricingMode} />
  );
}

describe("CatalogVariantFields", () => {
  it("previews the flat unit price for a 'variant' mode row as the user types", async () => {
    const user = userEvent.setup();
    render(<Harness pricingMode="variant" />);

    await user.type(screen.getByLabelText(/precio unitario/i), "120000");

    expect(screen.getByText(/se cobrará/i)).toHaveTextContent("Se cobrará $ 120.000 por unidad, cantidad libre.");
  });

  it("previews the derived per-unit price for a 'package' mode row", async () => {
    const user = userEvent.setup();
    render(<Harness pricingMode="package" />);

    await user.type(screen.getByLabelText(/unidades por paquete/i), "750");
    await user.type(screen.getByLabelText(/precio del paquete/i), "60000");

    expect(screen.getByText(/un paquete de 750 unidades/i)).toHaveTextContent(
      "Un paquete de 750 unidades cuesta $ 60.000 (~$ 80 por unidad). Solo se venden paquetes completos.",
    );
  });

  it("previews a per-unit tier's computed total (quantity × unit price)", async () => {
    const user = userEvent.setup();
    render(<Harness pricingMode="tiered" />);

    await user.click(screen.getByRole("button", { name: /agregar escalón/i }));
    await user.type(screen.getByLabelText(/^cantidad$/i), "12");
    await user.type(screen.getByLabelText(/precio por unidad/i), "20000");

    expect(screen.getByText(/unds a/i)).toHaveTextContent("12 unds a $ 20.000 c/u = $ 240.000");
  });

  it("previews a flat-total tier's derived per-unit price", async () => {
    const user = userEvent.setup();
    render(<Harness pricingMode="tiered" />);

    await user.click(screen.getByRole("button", { name: /agregar escalón/i }));
    await user.type(screen.getByLabelText(/^cantidad$/i), "50");
    await user.click(screen.getByLabelText(/tipo de precio/i));
    await user.click(await screen.findByRole("option", { name: "Total del escalón" }));
    await user.type(screen.getByLabelText(/precio total del escalón/i), "700000");

    expect(screen.getByText(/unds por/i)).toHaveTextContent("50 unds por $ 700.000 (~$ 14.000 c/u)");
  });

  it("disables 'Quitar' when it is the only row, and enables it once a second row exists", async () => {
    const user = userEvent.setup();
    render(<Harness pricingMode="variant" />);

    expect(screen.getByRole("button", { name: /quitar opción/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /agregar opción/i }));

    const removeButtons = screen.getAllByRole("button", { name: /quitar opción/i });
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons[0]).toBeEnabled();
    expect(removeButtons[1]).toBeEnabled();
  });
});
