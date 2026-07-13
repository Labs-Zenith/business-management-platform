import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computePeriod, periodDays } from "@/lib/services/payroll-period";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import PayrollPaymentFormDialog from "./payroll-payment-form-dialog-content";

const EMPLOYEES = [
  { id: "60000000-0000-4000-8000-000000000001", name: "Ana Empleada" },
  { id: "60000000-0000-4000-8000-000000000002", name: "Beto Empleado" },
];

function openDialog(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: /registrar pago/i }));
}

describe("PayrollPaymentFormDialog", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("POSTs the correct payload (employeeId, amount in cents, periodType, dates, notes) to /api/payroll-payments, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "payment-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.selectOptions(await screen.findByLabelText(/empleado/i), EMPLOYEES[1]!.id);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.selectOptions(screen.getByLabelText(/tipo de periodo/i), "mensual");
    fireEvent.change(screen.getByLabelText(/fecha de referencia/i), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText(/fecha de pago/i), { target: { value: "2026-07-20" } });
    await user.type(screen.getByLabelText(/nota/i), "Pago julio");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/payroll-payments", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      employeeId: EMPLOYEES[1]!.id,
      amount: 50000,
      periodType: "mensual",
      referenceDate: "2026-07-20",
      paymentDate: "2026-07-20",
      notes: "Pago julio",
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("converts a tricky decimal amount (8.575 pesos) to 858 cents, without IEEE-754 rounding-down artifacts", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "payment-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "8.575");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.amount).toBe(858);
  });

  it("omits the notes field from the payload when left blank", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "payment-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("notes");
  });

  it("blocks submission client-side and shows a validation error when amount is not greater than 0 (no request sent)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    // amount left at its default (0) — invalid, must be > 0
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/el monto debe ser mayor a 0/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server error message, keeps the dialog open, and does not refresh when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Empleado invalido." } }),
      }),
    );

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Empleado invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the generic error message and keeps the dialog open when fetch throws (network failure)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo registrar el pago. Verifica los datos e intenta de nuevo.",
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

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const submitButton = await screen.findByRole("button", { name: /guardando/i });
    expect(submitButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A disabled button can't be meaningfully re-clicked, but attempt it
    // anyway to prove no second request is fired while pending.
    await user.click(submitButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ data: { id: "payment-1" } }) });

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("defaults both date fields to LOCAL today's date (todayIsoDate convention)", async () => {
    const pinnedInstant = new Date("2026-07-07T04:30:00Z");
    vi.setSystemTime(pinnedInstant);
    const expectedLocalDate = `${pinnedInstant.getFullYear()}-${String(pinnedInstant.getMonth() + 1).padStart(2, "0")}-${String(pinnedInstant.getDate()).padStart(2, "0")}`;

    const user = userEvent.setup();
    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);

    expect(await screen.findByLabelText(/fecha de referencia/i)).toHaveValue(expectedLocalDate);
    expect(screen.getByLabelText(/fecha de pago/i)).toHaveValue(expectedLocalDate);
  });

  it("renders the empty-state fallback option and blocks submission via required-field validation when there are zero active employees", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PayrollPaymentFormDialog employees={[]} trigger={<button type="button">Registrar pago</button>} />);

    await openDialog(user);

    const employeeSelect = await screen.findByLabelText(/empleado/i);
    expect(screen.getByRole("option", { name: "Sin empleados activos" })).toBeInTheDocument();
    expect(employeeSelect).toHaveValue("");

    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/empleado requerido/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("live period preview", () => {
    it("shows the quincenal first-half range for a reference date in the first half of the month", async () => {
      const user = userEvent.setup();
      render(
        <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
      );

      await openDialog(user);
      fireEvent.change(await screen.findByLabelText(/fecha de referencia/i), { target: { value: "2026-07-05" } });

      const expected = computePeriod("quincenal", "2026-07-05");
      const expectedDays = periodDays(expected.periodStart, expected.periodEnd);
      const preview = await screen.findByTestId("payroll-period-preview");
      expect(preview).toHaveTextContent(expected.periodStart);
      expect(preview).toHaveTextContent(expected.periodEnd);
      expect(preview).toHaveTextContent(`${expectedDays}`);
    });

    it("updates the preview when the reference date crosses the 15th/16th boundary (quincenal)", async () => {
      const user = userEvent.setup();
      render(
        <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
      );

      await openDialog(user);
      const referenceDateInput = await screen.findByLabelText(/fecha de referencia/i);

      fireEvent.change(referenceDateInput, { target: { value: "2026-07-15" } });
      const firstHalf = computePeriod("quincenal", "2026-07-15");
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(
        `${firstHalf.periodStart}`,
      );
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${firstHalf.periodEnd}`);

      fireEvent.change(referenceDateInput, { target: { value: "2026-07-16" } });
      const secondHalf = computePeriod("quincenal", "2026-07-16");
      expect(secondHalf.periodStart).not.toBe(firstHalf.periodStart);
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(
        `${secondHalf.periodStart}`,
      );
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${secondHalf.periodEnd}`);
    });

    it("updates the preview when periodType toggles between quincenal and mensual for the same reference date", async () => {
      const user = userEvent.setup();
      render(
        <PayrollPaymentFormDialog employees={EMPLOYEES} trigger={<button type="button">Registrar pago</button>} />,
      );

      await openDialog(user);
      fireEvent.change(await screen.findByLabelText(/fecha de referencia/i), { target: { value: "2026-07-20" } });

      const quincenal = computePeriod("quincenal", "2026-07-20");
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(`${quincenal.periodStart}`);
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${quincenal.periodEnd}`);

      await user.selectOptions(screen.getByLabelText(/tipo de periodo/i), "mensual");

      const mensual = computePeriod("mensual", "2026-07-20");
      expect(mensual.periodStart).not.toBe(quincenal.periodStart);
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(`${mensual.periodStart}`);
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${mensual.periodEnd}`);
    });
  });
});
