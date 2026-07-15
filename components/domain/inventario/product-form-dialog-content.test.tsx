import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import ProductFormDialog from "./product-form-dialog-content";

const EDIT_PRODUCT = {
  id: "80000000-0000-4000-8000-000000000001",
  name: "Tornillos 1/4",
  sku: "TOR-14",
  unitCost: 500,
  active: true,
};

describe("ProductFormDialog (create mode)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the trimmed sku and unit cost converted to integer cents to /api/products, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "new-id", name: "Nuevo producto" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo producto");
    await user.type(screen.getByLabelText(/sku/i), "  ABC-1  ");
    await user.clear(screen.getByLabelText(/costo unitario/i));
    await user.type(screen.getByLabelText(/costo unitario/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/products", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ name: "Nuevo producto", sku: "ABC-1", unitCost: 50_000 });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("does not render a 'Stock minimo' field anymore (low-stock is a fixed rule, not a per-product value)", async () => {
    const user = userEvent.setup();
    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await screen.findByLabelText(/nombre/i);

    expect(screen.queryByLabelText(/stock minimo/i)).not.toBeInTheDocument();
  });

  it("converts a decimal unit cost (8,58 pesos, comma decimal) to 858 cents through the MoneyInput mask", async () => {
    // `MoneyInput` (COP mask) caps entry at 2 decimals and uses "," as the
    // decimal separator, so the original 3-decimal (half-cent) IEEE-754 edge
    // case can no longer be typed through this UI — that exact case is still
    // covered directly at the unit level by `lib/money.test.ts`'s
    // `pesosToCents` tests (unchanged).
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "new-id", name: "Nuevo producto" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo producto");
    await user.clear(screen.getByLabelText(/costo unitario/i));
    await user.type(screen.getByLabelText(/costo unitario/i), "8,58");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.unitCost).toBe(858);
  });

  it("blocks submission client-side and shows an inline validation error when unitCost is cleared (no request sent)", async () => {
    // Plain `useState` form with `<form noValidate>` — no client-side
    // validation existed for `unitCost` before this fix (clearing it
    // submitted `0`, only caught by the server), mirroring
    // `movement-form-dialog-content.tsx`'s established `validate()`/
    // `fieldErrors` pattern.
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo producto");
    await user.clear(screen.getByLabelText(/costo unitario/i));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/el costo debe ser mayor a 0/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits the sku field entirely when left blank", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "new-id" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo producto");
    await user.clear(screen.getByLabelText(/costo unitario/i));
    await user.type(screen.getByLabelText(/costo unitario/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("sku");
  });

  it("does not render the active switch in create mode (a new product is always active by construction)", async () => {
    const user = userEvent.setup();
    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await screen.findByLabelText(/nombre/i);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shows the server error message, keeps the dialog open, and does not refresh when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Nombre invalido." } }),
      }),
    );

    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "X");
    await user.clear(screen.getByLabelText(/costo unitario/i));
    await user.type(screen.getByLabelText(/costo unitario/i), "1000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nombre invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("X");
    // Displayed value is COP-grouped ("1.000"), not the raw "1000" — the
    // raw submitted value is asserted separately via the payload assertions.
    expect(screen.getByLabelText(/costo unitario/i)).toHaveValue("1.000");
  });

  it("shows the generic error message and keeps the dialog open when fetch throws (network failure)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo producto");
    await user.clear(screen.getByLabelText(/costo unitario/i));
    await user.type(screen.getByLabelText(/costo unitario/i), "1000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar el producto. Verifica los datos e intenta de nuevo.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Nuevo producto");
    // Displayed value is COP-grouped ("1.000"), not the raw "1000" — the
    // raw submitted value is asserted separately via the payload assertions.
    expect(screen.getByLabelText(/costo unitario/i)).toHaveValue("1.000");
  });

  it("disables the submit button while the request is in flight and ignores a second click, firing fetch only once", async () => {
    const user = userEvent.setup();

    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const deferred = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(deferred);
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductFormDialog mode="create" trigger={<button type="button">Nuevo producto</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo producto/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo producto");
    await user.clear(screen.getByLabelText(/costo unitario/i));
    await user.type(screen.getByLabelText(/costo unitario/i), "1000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const submitButton = await screen.findByRole("button", { name: /guardando/i });
    expect(submitButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A disabled button can't be meaningfully re-clicked, but attempt it
    // anyway to prove no second request is fired while pending.
    await user.click(submitButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ data: { id: "new-id" } }) });

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ProductFormDialog (edit mode)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pre-fills the form with the existing product's data, converting cents back to pesos", async () => {
    const user = userEvent.setup();
    render(
      <ProductFormDialog mode="edit" product={EDIT_PRODUCT} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(await screen.findByDisplayValue("Tornillos 1/4")).toBeInTheDocument();
    expect(screen.getByLabelText(/sku/i)).toHaveValue("TOR-14");
    expect(screen.getByLabelText(/costo unitario/i)).toHaveValue("5");
  });

  it("renders the active switch in edit mode, defaulting to the product's current active state", async () => {
    const user = userEvent.setup();
    render(
      <ProductFormDialog mode="edit" product={EDIT_PRODUCT} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await screen.findByLabelText(/nombre/i);

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("PATCHes /api/products/{id} with name, sku, unitCost (cents), and active", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...EDIT_PRODUCT, name: "Tornillos actualizados" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductFormDialog mode="edit" product={EDIT_PRODUCT} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const nameInput = await screen.findByDisplayValue("Tornillos 1/4");
    await user.clear(nameInput);
    await user.type(nameInput, "Tornillos actualizados");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/products/${EDIT_PRODUCT.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.name).toBe("Tornillos actualizados");
    expect(body.sku).toBe("TOR-14");
    expect(body.unitCost).toBe(500);
    expect(body.active).toBe(false);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("PATCHes a null sku when the sku field is cleared", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: EDIT_PRODUCT }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductFormDialog mode="edit" product={EDIT_PRODUCT} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await user.clear(await screen.findByLabelText(/sku/i));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.sku).toBeNull();
  });
});
