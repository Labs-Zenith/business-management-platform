import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pesosToCents } from "@/lib/money";
import { selectOption } from "@/components/ui/select-test-helpers";

/** The form no longer navigates: it reports the saved id and the dialog decides what to do. */
const onSavedMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import CatalogProductFormContent, { type CatalogProductFormContentProduct } from "./catalog-product-form-content";

describe("CatalogProductFormContent", () => {
  beforeEach(() => {
    onSavedMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a 'fixed' mode product with fixedUnitPrice converted to integer cents, then reports the saved id", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "prod-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} />);

    // The 'fixed' mode is the create-mode default, so "Precio" is visible
    // without ever opening the "Precio avanzado" disclosure — the whole
    // point of this change.
    await user.type(screen.getByLabelText(/^nombre$/i), "Volante A5");
    await user.clear(screen.getByLabelText(/^precio$/i));
    await user.type(screen.getByLabelText(/^precio$/i), "5000");
    await user.click(screen.getByRole("button", { name: /crear producto/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/catalog-products", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      name: "Volante A5",
      pricingMode: "fixed",
      fixedUnitPrice: pesosToCents(5000),
      minOrderQuantity: 1,
    });
    expect(onSavedMock).toHaveBeenCalledWith("prod-1");
  });

  it("POSTs a 'variant' mode product with each variant's unitPrice converted to integer cents", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "prod-2" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} />);

    await user.type(screen.getByLabelText(/^nombre$/i), "Aviso en acrílico");
    // "Modo de precio" lives behind the "Precio avanzado" disclosure, closed
    // by default on create.
    await user.click(screen.getByRole("button", { name: /precio avanzado/i }));
    await selectOption(user, /modo de precio/i, "Por opciones");

    await user.type(screen.getByLabelText(/nombre de la variante/i), "150x55 cm");
    await user.clear(screen.getByLabelText(/^precio unitario$/i));
    await user.type(screen.getByLabelText(/^precio unitario$/i), "120000");
    await user.clear(screen.getByLabelText(/cantidad mínima de pedido/i));
    await user.type(screen.getByLabelText(/cantidad mínima de pedido/i), "2");

    await user.click(screen.getByRole("button", { name: /crear producto/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.pricingMode).toBe("variant");
    expect(body.minOrderQuantity).toBe(2);
    expect(body.variants).toEqual([{ name: "150x55 cm", unitPrice: pesosToCents(120000) }]);
  });

  it("POSTs a 'package' mode product with packageQuantity/packageTotalPrice, and never sends minOrderQuantity (derived server-side)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "prod-3" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} />);

    await user.type(screen.getByLabelText(/^nombre$/i), "Stickers 3x3 cm");
    await user.click(screen.getByRole("button", { name: /precio avanzado/i }));
    await selectOption(user, /modo de precio/i, "Por paquete");

    await user.type(screen.getByLabelText(/nombre del paquete/i), "Paquete de 750");
    await user.clear(screen.getByLabelText(/unidades por paquete/i));
    await user.type(screen.getByLabelText(/unidades por paquete/i), "750");
    await user.clear(screen.getByLabelText(/precio del paquete/i));
    await user.type(screen.getByLabelText(/precio del paquete/i), "60000");

    await user.click(screen.getByRole("button", { name: /crear producto/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.pricingMode).toBe("package");
    expect(body.minOrderQuantity).toBeUndefined();
    expect(body.variants).toEqual([
      { name: "Paquete de 750", packageQuantity: 750, packageTotalPrice: pesosToCents(60000) },
    ]);
  });

  it("POSTs a 'tiered' mode product with a mix of per-unit and flat-total tiers under one variant", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "prod-4" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} />);

    await user.type(screen.getByLabelText(/^nombre$/i), "Agendas 2027");
    await user.click(screen.getByRole("button", { name: /precio avanzado/i }));
    await selectOption(user, /modo de precio/i, "Por cantidad");

    await user.type(screen.getByLabelText(/nombre de la variante/i), "Agenda ejecutiva");

    // First tier: default "Por unidad" price kind.
    await user.click(screen.getByRole("button", { name: /agregar escalón/i }));
    await user.clear(screen.getByLabelText(/^cantidad$/i));
    await user.type(screen.getByLabelText(/^cantidad$/i), "12");
    await user.clear(screen.getByLabelText(/precio por unidad/i));
    await user.type(screen.getByLabelText(/precio por unidad/i), "20000");

    // Second tier: switched to "Total del escalón" (flat lump sum).
    await user.click(screen.getByRole("button", { name: /agregar escalón/i }));
    const quantityInputs = screen.getAllByLabelText(/^cantidad$/i);
    await user.clear(quantityInputs[1]!);
    await user.type(quantityInputs[1]!, "50");
    const priceKindSelects = screen.getAllByLabelText(/tipo de precio/i);
    await user.click(priceKindSelects[1]!);
    await user.click(await screen.findByRole("option", { name: "Total del escalón" }));
    const flatPriceInput = screen.getByLabelText(/precio total del escalón/i);
    await user.clear(flatPriceInput);
    await user.type(flatPriceInput, "700000");

    await user.click(screen.getByRole("button", { name: /crear producto/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.pricingMode).toBe("tiered");
    expect(body.variants).toEqual([
      {
        name: "Agenda ejecutiva",
        tiers: [
          { quantity: 12, unitPrice: pesosToCents(20000) },
          { quantity: 50, flatTotalPrice: pesosToCents(700000) },
        ],
      },
    ]);
  });

  it("POSTs an 'area' mode product with base/rate/optional-min prices", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "prod-5" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} />);

    await user.type(screen.getByLabelText(/^nombre$/i), "Lona impresa");
    await user.click(screen.getByRole("button", { name: /precio avanzado/i }));
    await selectOption(user, /modo de precio/i, "Por medida");

    await user.clear(screen.getByLabelText(/precio base/i));
    await user.type(screen.getByLabelText(/precio base/i), "10000");
    await user.clear(screen.getByLabelText(/precio por m²/i));
    await user.type(screen.getByLabelText(/precio por m²/i), "80000");
    await user.clear(screen.getByLabelText(/precio mínimo/i));
    await user.type(screen.getByLabelText(/precio mínimo/i), "15000");

    await user.click(screen.getByRole("button", { name: /crear producto/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      name: "Lona impresa",
      pricingMode: "area",
      areaBasePrice: pesosToCents(10000),
      areaRatePerM2: pesosToCents(80000),
      areaMinPrice: pesosToCents(15000),
      minOrderQuantity: 1,
    });
  });

  it("pre-fills every field from an existing product and PATCHes on save, including the edit-only 'active' toggle", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "prod-9" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const product: CatalogProductFormContentProduct = {
      id: "prod-9",
      name: "Stickers 3x3 cm",
      category: "Stickers",
      description: null,
      pricingMode: "package",
      minOrderQuantity: 1,
      fixedUnitPrice: null,
      areaBasePrice: null,
      areaRatePerM2: null,
      areaMinPrice: null,
      active: true,
      variants: [
        {
          name: "Paquete de 750",
          description: null,
          unitPrice: null,
          packageQuantity: 750,
          packageTotalPrice: 6_000_000,
          tiers: [],
        },
      ],
    };

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={["Stickers"]} product={product} />);

    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue("Stickers 3x3 cm");
    expect(screen.getByLabelText(/categoría/i)).toHaveValue("Stickers");
    expect(screen.getByLabelText(/nombre del paquete/i)).toHaveValue("Paquete de 750");
    expect(screen.getByLabelText(/unidades por paquete/i)).toHaveValue("750");
    expect(screen.getByLabelText(/precio del paquete/i)).toHaveValue("60.000");

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog-products/prod-9",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.active).toBe(true);
    expect(body.category).toBe("Stickers");
    expect(body.variants).toEqual([
      { name: "Paquete de 750", packageQuantity: 750, packageTotalPrice: 6_000_000 },
    ]);
    expect(onSavedMock).toHaveBeenCalledWith("prod-9");
  });

  it("toggling 'Producto activo' off in edit mode sends active: false", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "prod-9" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const product: CatalogProductFormContentProduct = {
      id: "prod-9",
      name: "Volantes",
      category: null,
      description: null,
      pricingMode: "fixed",
      minOrderQuantity: 1,
      fixedUnitPrice: 500_00,
      areaBasePrice: null,
      areaRatePerM2: null,
      areaMinPrice: null,
      active: true,
      variants: [],
    };

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} product={product} />);

    // `Switch` renders a `role="switch"` element, not a labelable native
    // input — `getByLabelText` would match both it and its hidden mirror
    // input (base-ui's form-submission shim), so this uses `getByRole`
    // instead, matching `product-form-dialog-content.test.tsx`'s convention.
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.active).toBe(false);
  });

  it("keeps the submit button disabled until the required fields for the chosen mode are valid", async () => {
    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} />);
    expect(screen.getByRole("button", { name: /crear producto/i })).toBeDisabled();
  });

  it("keeps the 'Precio avanzado' disclosure closed by default when creating a new product", () => {
    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} />);

    expect(screen.getByRole("button", { name: /precio avanzado/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/modo de precio/i)).not.toBeInTheDocument();
  });

  it("opens the 'Precio avanzado' disclosure by default when editing a product whose pricingMode isn't 'fixed'", () => {
    const product: CatalogProductFormContentProduct = {
      id: "prod-10",
      name: "Stickers 3x3 cm",
      category: null,
      description: null,
      pricingMode: "package",
      minOrderQuantity: 1,
      fixedUnitPrice: null,
      areaBasePrice: null,
      areaRatePerM2: null,
      areaMinPrice: null,
      active: true,
      variants: [
        {
          name: "Paquete de 750",
          description: null,
          unitPrice: null,
          packageQuantity: 750,
          packageTotalPrice: 6_000_000,
          tiers: [],
        },
      ],
    };

    render(<CatalogProductFormContent onSaved={onSavedMock} categories={[]} product={product} />);

    // A real business already has products configured this way in
    // production — the ladder must never be hidden from someone editing it.
    expect(screen.getByRole("button", { name: /precio avanzado/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/modo de precio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del paquete/i)).toBeInTheDocument();
  });
});
