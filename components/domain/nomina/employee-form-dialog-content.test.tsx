import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import EmployeeFormDialog from "./employee-form-dialog-content";

const EDIT_EMPLOYEE = {
  id: "60000000-0000-4000-8000-000000000001",
  name: "Ana Empleada",
  baseSalary: 150_000_00,
  active: true,
};

describe("EmployeeFormDialog (create mode)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the base salary converted to integer cents to /api/employees, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "new-id", name: "Nuevo Empleado" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmployeeFormDialog mode="create" trigger={<button type="button">Nuevo empleado</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo empleado/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Empleado");
    await user.clear(screen.getByLabelText(/salario base/i));
    await user.type(screen.getByLabelText(/salario base/i), "150000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/employees", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ name: "Nuevo Empleado", baseSalary: 150_000_00 });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("converts a decimal base salary (8,58 pesos, comma decimal) to 858 cents through the MoneyInput mask", async () => {
    // `MoneyInput` (COP mask) caps entry at 2 decimals and uses "," as the
    // decimal separator, so the original 3-decimal (half-cent) IEEE-754 edge
    // case can no longer be typed through this UI — that exact case is still
    // covered directly at the unit level by `lib/money.test.ts`'s
    // `pesosToCents` tests (unchanged).
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "new-id", name: "Nuevo Empleado" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmployeeFormDialog mode="create" trigger={<button type="button">Nuevo empleado</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo empleado/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Empleado");
    await user.clear(screen.getByLabelText(/salario base/i));
    await user.type(screen.getByLabelText(/salario base/i), "8,58");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.baseSalary).toBe(858);
  });

  it("blocks submission client-side and shows an inline validation error when baseSalary is cleared (no request sent)", async () => {
    // Plain `useState` form with `<form noValidate>` — no client-side
    // validation existed for `baseSalary` before this fix (clearing it
    // submitted `0`, only caught by the server), mirroring
    // `movement-form-dialog-content.tsx`'s established `validate()`/
    // `fieldErrors` pattern.
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmployeeFormDialog mode="create" trigger={<button type="button">Nuevo empleado</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo empleado/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Empleado");
    await user.clear(screen.getByLabelText(/salario base/i));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/el salario base debe ser mayor a 0/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not render the active switch in create mode (a new employee is always active by construction)", async () => {
    const user = userEvent.setup();
    render(<EmployeeFormDialog mode="create" trigger={<button type="button">Nuevo empleado</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo empleado/i }));
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

    render(<EmployeeFormDialog mode="create" trigger={<button type="button">Nuevo empleado</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo empleado/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "X");
    await user.clear(screen.getByLabelText(/salario base/i));
    await user.type(screen.getByLabelText(/salario base/i), "1000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nombre invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the generic error message and keeps the dialog open when fetch throws (network failure)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(<EmployeeFormDialog mode="create" trigger={<button type="button">Nuevo empleado</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo empleado/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Empleado");
    await user.clear(screen.getByLabelText(/salario base/i));
    await user.type(screen.getByLabelText(/salario base/i), "1000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar el empleado. Verifica los datos e intenta de nuevo.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight and ignores a second click, firing fetch only once", async () => {
    const user = userEvent.setup();

    // A manually-controlled/deferred promise: `fetch` doesn't resolve until
    // this test explicitly calls `resolveFetch(...)`, so the pending window
    // is actually observable, mirroring `business-switcher.test.tsx`'s
    // established pattern for this exact kind of test.
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const deferred = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(deferred);
    vi.stubGlobal("fetch", fetchMock);

    render(<EmployeeFormDialog mode="create" trigger={<button type="button">Nuevo empleado</button>} />);

    await user.click(screen.getByRole("button", { name: /nuevo empleado/i }));
    await user.type(await screen.findByLabelText(/nombre/i), "Nuevo Empleado");
    await user.clear(screen.getByLabelText(/salario base/i));
    await user.type(screen.getByLabelText(/salario base/i), "1000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const submitButton = await screen.findByRole("button", { name: /guardando/i });
    expect(submitButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A disabled button can't be meaningfully re-clicked, but attempt it
    // anyway to prove no second request is fired while pending.
    await user.click(submitButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ data: { id: "new-id", name: "Nuevo Empleado" } }) });

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("EmployeeFormDialog (edit mode)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pre-fills the form with the existing employee's data, converting cents back to pesos", async () => {
    const user = userEvent.setup();
    render(
      <EmployeeFormDialog mode="edit" employee={EDIT_EMPLOYEE} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(await screen.findByDisplayValue("Ana Empleada")).toBeInTheDocument();
    // Displayed value is COP-grouped ("150.000" pesos), not the raw "150000".
    expect(screen.getByLabelText(/salario base/i)).toHaveValue("150.000");
  });

  it("renders the active switch in edit mode, defaulting to the employee's current active state", async () => {
    const user = userEvent.setup();
    render(
      <EmployeeFormDialog mode="edit" employee={EDIT_EMPLOYEE} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    await screen.findByLabelText(/nombre/i);

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("PATCHes /api/employees/{id} with name, baseSalary (cents), and active", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...EDIT_EMPLOYEE, name: "Ana Actualizada" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeFormDialog mode="edit" employee={EDIT_EMPLOYEE} trigger={<button type="button">Editar</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /editar/i }));
    const nameInput = await screen.findByDisplayValue("Ana Empleada");
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Actualizada");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/employees/${EDIT_EMPLOYEE.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.name).toBe("Ana Actualizada");
    expect(body.baseSalary).toBe(150_000_00);
    expect(body.active).toBe(false);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
