import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import MovementFormDialog from "./movement-form-dialog-content";

const PRODUCTS = [
  { id: "80000000-0000-4000-8000-000000000001", name: "Tornillos 1/4" },
  { id: "80000000-0000-4000-8000-000000000002", name: "Martillos" },
];

function openDialog(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: /registrar movimiento/i }));
}

describe("MovementFormDialog", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the correct payload (productId, type, quantity, note) to /api/inventory-movements, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "movement-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);
    await user.selectOptions(await screen.findByLabelText(/producto/i), PRODUCTS[1]!.id);
    await user.selectOptions(screen.getByLabelText(/tipo/i), "out");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "5");
    await user.type(screen.getByLabelText(/nota/i), "Ajuste de inventario");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/inventory-movements",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      productId: PRODUCTS[1]!.id,
      type: "out",
      quantity: 5,
      note: "Ajuste de inventario",
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("only offers the products passed via the products prop (page pre-filters to active-only)", async () => {
    const user = userEvent.setup();
    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);

    for (const product of PRODUCTS) {
      expect(screen.getByRole("option", { name: product.name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("option", { name: "Sin productos activos" })).not.toBeInTheDocument();
  });

  it("omits the note field from the payload when left blank", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "movement-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "5");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("note");
  });

  it("blocks submission client-side and shows a validation error when quantity is zero (no request sent)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);
    // quantity left at its default (0) — invalid, must be > 0
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/la cantidad debe ser un entero mayor a 0/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks submission client-side and shows a validation error when quantity is negative (no request sent)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);
    // `user.type` doesn't reliably drive a leading "-" into a
    // `type="number"` input across jsdom versions — `fireEvent.change` sets
    // the value directly, mirroring `payroll-payment-form-dialog-content.test.tsx`'s
    // established `fireEvent.change` convention for inputs.
    fireEvent.change(screen.getByLabelText(/cantidad/i), { target: { value: "-3" } });
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/la cantidad debe ser un entero mayor a 0/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's floor-at-zero rejection message, keeps the dialog open, and does not refresh", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { code: "VALIDATION_ERROR", message: "Movement would drive stock below zero" },
        }),
      }),
    );

    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);
    await user.selectOptions(await screen.findByLabelText(/tipo/i), "out");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "999");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Movement would drive stock below zero");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/cantidad/i)).toHaveValue(999);
    expect(screen.getByLabelText(/tipo/i)).toHaveValue("out");
  });

  it("shows the generic error message and keeps the dialog open when fetch throws (network failure)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "5");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo registrar el movimiento. Verifica los datos e intenta de nuevo.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight and ignores a second click, firing fetch only once", async () => {
    const user = userEvent.setup();

    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const deferred = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(deferred);
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementFormDialog products={PRODUCTS} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "5");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const submitButton = await screen.findByRole("button", { name: /guardando/i });
    expect(submitButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A disabled button can't be meaningfully re-clicked, but attempt it
    // anyway to prove no second request is fired while pending.
    await user.click(submitButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ data: { id: "movement-1" } }) });

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders the empty-state fallback option and blocks submission via required-field validation when there are zero active products", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementFormDialog products={[]} trigger={<button type="button">Registrar movimiento</button>} />);

    await openDialog(user);

    const productSelect = await screen.findByLabelText(/producto/i);
    expect(screen.getByRole("option", { name: "Sin productos activos" })).toBeInTheDocument();
    expect(productSelect).toHaveValue("");

    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "5");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/producto requerido/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
