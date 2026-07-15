import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import BusinessProfileForm from "./business-profile-form";

const BUSINESS = {
  name: "Negocio Demo",
  phone: "3000000000",
  email: "contacto@negociodemo.test",
  address: "Calle 10 # 20-30, Bogota",
  currency: "COP",
};

describe("BusinessProfileForm", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the admin the read-only profile with an Editar button first, not the form", () => {
    render(<BusinessProfileForm business={BUSINESS} canEdit />);

    expect(screen.getByText(BUSINESS.name)).toBeInTheDocument();
    expect(screen.getByText(BUSINESS.currency)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox").length).toBe(0);
  });

  it("reveals the editable form, pre-filled from the business prop, after clicking Editar", async () => {
    const user = userEvent.setup();
    render(<BusinessProfileForm business={BUSINESS} canEdit />);

    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(screen.getByLabelText(/nombre/i)).toHaveValue(BUSINESS.name);
    expect(screen.getByLabelText(/telefono/i)).toHaveValue(BUSINESS.phone);
    expect(screen.getByLabelText(/^email/i)).toHaveValue(BUSINESS.email);
    expect(screen.getByLabelText(/direccion/i)).toHaveValue(BUSINESS.address);
    expect(screen.getByLabelText(/moneda/i)).toHaveValue(BUSINESS.currency);
  });

  it("Cancelar discards edits and returns to the read-only view", async () => {
    const user = userEvent.setup();
    render(<BusinessProfileForm business={BUSINESS} canEdit />);

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const nameInput = screen.getByLabelText(/nombre/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Nombre sin guardar");

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.queryAllByRole("textbox").length).toBe(0);
    expect(screen.getByText(BUSINESS.name)).toBeInTheDocument();
    expect(screen.queryByText("Nombre sin guardar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByLabelText(/nombre/i)).toHaveValue(BUSINESS.name);
  });

  it("PATCHes /api/business with the edited fields, refreshes, and returns to read-only on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...BUSINESS, name: "Negocio Renombrado" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BusinessProfileForm business={BUSINESS} canEdit />);
    await user.click(screen.getByRole("button", { name: /editar/i }));

    const nameInput = screen.getByLabelText(/nombre/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Negocio Renombrado");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/business",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.name).toBe("Negocio Renombrado");

    expect(await screen.findByText(/guardado/i)).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("textbox").length).toBe(0);
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
  });

  it("shows the server error message, stays in edit mode, and does not refresh when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Correo invalido." } }),
      }),
    );

    render(<BusinessProfileForm business={BUSINESS} canEdit />);
    await user.click(screen.getByRole("button", { name: /editar/i }));

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("renders a read-only profile with no inputs, no Save button, and no Editar button when canEdit is false (worker, no role gate was the security gap)", () => {
    render(<BusinessProfileForm business={BUSINESS} canEdit={false} />);

    expect(screen.getByText(BUSINESS.name)).toBeInTheDocument();
    expect(screen.getByText(BUSINESS.currency)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox").length).toBe(0);
  });
});
