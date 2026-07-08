import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import CustomerFormDialog from "./customer-form-dialog-content";

const EDIT_CUSTOMER = {
  id: "40000000-0000-4000-8000-000000000001",
  name: "Ana Gomez",
  documentNumber: "1000000001",
  email: "ana.gomez@example.com",
  phone: "3001111111",
  address: null,
  notes: null,
  isActive: true,
};

describe("CustomerFormDialog (create mode)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs only the filled-in fields to /api/customers, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "new-id", name: "Nuevo Cliente" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Cliente");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Nuevo Cliente" }),
      }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows the server error message and does not refresh when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Nombre invalido." } }),
      }),
    );

    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "X");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nombre invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does not render the isActive switch in create mode (customers are always active by default)", async () => {
    const user = userEvent.setup();
    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await screen.findByLabelText(/nombre/i);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});

describe("CustomerFormDialog (edit mode)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pre-fills the form with the existing customer's data", async () => {
    const user = userEvent.setup();
    render(
      <CustomerFormDialog
        mode="edit"
        customer={EDIT_CUSTOMER}
        trigger={<button type="button">Editar</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(await screen.findByDisplayValue("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3001111111")).toBeInTheDocument();
  });

  it("PATCHes /api/customers/{id} with descriptive fields plus isActive", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...EDIT_CUSTOMER, phone: "3009999999" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CustomerFormDialog
        mode="edit"
        customer={EDIT_CUSTOMER}
        trigger={<button type="button">Editar</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const phoneInput = await screen.findByDisplayValue("3001111111");
    await user.clear(phoneInput);
    await user.type(phoneInput, "3009999999");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/customers/${EDIT_CUSTOMER.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.phone).toBe("3009999999");
    expect(body.isActive).toBe(true);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
