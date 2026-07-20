import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  address: "Cra 1 # 2-3",
  notes: "Cliente frecuente",
  isActive: true,
};

describe("CustomerFormDialog (create mode)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the trimmed name and omits blank optional fields to /api/customers, closes, and refreshes on success", async () => {
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

    expect(fetchMock).toHaveBeenCalledWith("/api/customers", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ name: "Nuevo Cliente" });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("includes optional fields (documento, email, teléfono, dirección, notas) once filled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "new-id", name: "Nuevo Cliente" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Cliente");
    await user.type(screen.getByLabelText(/documento/i), "1234567890");
    await user.type(screen.getByLabelText(/email/i), "cliente@example.com");
    await user.type(screen.getByLabelText(/teléfono/i), "3009998888");
    await user.type(screen.getByLabelText(/dirección/i), "Calle 1");
    await user.type(screen.getByLabelText(/notas/i), "Paga siempre a tiempo");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      name: "Nuevo Cliente",
      documentNumber: "1234567890",
      email: "cliente@example.com",
      phone: "3009998888",
      address: "Calle 1",
      notes: "Paga siempre a tiempo",
    });
  });

  it("does not render the active switch in create mode (a new customer is always active by construction)", async () => {
    const user = userEvent.setup();
    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
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

    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "X");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nombre invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the generic error message and keeps the dialog open when fetch throws (network failure)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Cliente");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar el cliente. Verifica los datos e intenta de nuevo.",
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

    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Cliente");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const submitButton = await screen.findByRole("button", { name: /guardando/i });
    expect(submitButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(submitButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ data: { id: "new-id", name: "Nuevo Cliente" } }) });

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a live inline error and disables the submit button when email is invalid, then enables it once fixed", async () => {
    const user = userEvent.setup();
    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Cliente");

    // A pristine, untouched email field shows no error yet, even though the
    // form is otherwise valid.
    expect(screen.queryByText(/correo/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.tab();

    expect(await screen.findByText(/correo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();

    await user.clear(screen.getByLabelText(/email/i));
    await user.type(screen.getByLabelText(/email/i), "cliente@example.com");

    await waitFor(() => expect(screen.queryByText(/correo/i)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled();
  });

  it("resets the form back to blank values if the dialog is closed and reopened without submitting", async () => {
    const user = userEvent.setup();
    render(<CustomerFormDialog mode="create" trigger={<button type="button">Crear cliente</button>} />);

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Borrador sin guardar");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /crear cliente/i }));
    expect(await screen.findByLabelText(/nombre/i)).toHaveValue("");
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
      <CustomerFormDialog mode="edit" customer={EDIT_CUSTOMER} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(await screen.findByDisplayValue("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1000000001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ana.gomez@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3001111111")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cra 1 # 2-3")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cliente frecuente")).toBeInTheDocument();
  });

  it("renders the active switch in edit mode, defaulting to the customer's current active state", async () => {
    const user = userEvent.setup();
    render(
      <CustomerFormDialog mode="edit" customer={EDIT_CUSTOMER} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await screen.findByLabelText(/nombre/i);

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("PATCHes /api/customers/{id} with the descriptive fields plus isActive", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...EDIT_CUSTOMER, name: "Ana Actualizada" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CustomerFormDialog mode="edit" customer={EDIT_CUSTOMER} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const nameInput = await screen.findByDisplayValue("Ana Gomez");
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Actualizada");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/customers/${EDIT_CUSTOMER.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.name).toBe("Ana Actualizada");
    expect(body.documentNumber).toBe(EDIT_CUSTOMER.documentNumber);
    expect(body.isActive).toBe(false);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
