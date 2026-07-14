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

  it("pre-fills every field from the business prop", () => {
    render(<BusinessProfileForm business={BUSINESS} canEdit />);

    expect(screen.getByLabelText(/nombre/i)).toHaveValue(BUSINESS.name);
    expect(screen.getByLabelText(/telefono/i)).toHaveValue(BUSINESS.phone);
    expect(screen.getByLabelText(/^email/i)).toHaveValue(BUSINESS.email);
    expect(screen.getByLabelText(/direccion/i)).toHaveValue(BUSINESS.address);
    expect(screen.getByLabelText(/moneda/i)).toHaveValue(BUSINESS.currency);
  });

  it("PATCHes /api/business with the edited fields, shows a success message, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...BUSINESS, name: "Negocio Renombrado" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BusinessProfileForm business={BUSINESS} canEdit />);

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
  });

  it("shows the server error message and does not refresh when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Correo invalido." } }),
      }),
    );

    render(<BusinessProfileForm business={BUSINESS} canEdit />);

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("renders a read-only profile with no inputs and no Save button when canEdit is false (worker, no role gate was the security gap)", () => {
    render(<BusinessProfileForm business={BUSINESS} canEdit={false} />);

    expect(screen.getByText(BUSINESS.name)).toBeInTheDocument();
    expect(screen.getByText(BUSINESS.currency)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox").length).toBe(0);
  });
});
