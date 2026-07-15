import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { computePeriod, periodDays } from "@/lib/services/payroll-period";
import { clearDay, displayDate, pickDay } from "@/components/ui/date-picker-test-helpers";
import { selectOption } from "@/components/ui/select-test-helpers";

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

const PERIOD_TYPES = [
  { id: "e1000000-0000-4000-8000-000000000001", code: "quincenal", label: "Quincenal" },
  { id: "e1000000-0000-4000-8000-000000000002", code: "mensual", label: "Mensual" },
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
    // Pin "today" so the Calendar opens on a known month without navigation.
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "payment-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await selectOption(user, /empleado/i, EMPLOYEES[1]!.name);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await selectOption(user, /tipo de periodo/i, "Mensual");

    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha de referencia/i, dayLabel);
    await pickDay(user, /fecha de pago/i, dayLabel);

    await user.type(screen.getByLabelText(/nota/i), "Pago julio");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/payroll-payments", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      employeeId: EMPLOYEES[1]!.id,
      amount: 50000,
      periodType: "mensual",
      // The catalog id matching "mensual" — resolved from the `periodTypes`
      // prop by code, see `payroll-payment-form-dialog-content.tsx`'s
      // `periodTypeId` lookup at submit time.
      periodTypeId: PERIOD_TYPES[1]!.id,
      referenceDate: "2026-07-20",
      paymentDate: "2026-07-20",
      notes: "Pago julio",
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("converts a decimal amount (8,58 pesos, comma decimal) to 858 cents through the MoneyInput mask", async () => {
    // `MoneyInput` (COP mask) caps entry at 2 decimals and uses "," as the
    // decimal separator, so the original 3-decimal (half-cent) IEEE-754 edge
    // case can no longer be typed through this UI — that exact case is still
    // covered directly at the unit level by `lib/money.test.ts`'s
    // `pesosToCents` tests (unchanged).
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "payment-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "8,58");
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
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
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
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    // amount left at its default ("") — invalid, must be > 0
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
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
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
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
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
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
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
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);

    // The native `type="date"` inputs are gone — both triggers are now
    // `<button>`s labeled via `<Label htmlFor>`, displaying the
    // `DatePicker`'s "d MMM yyyy" formatted text instead of an ISO `value`.
    expect(await screen.findByLabelText(/fecha de referencia/i)).toHaveTextContent(displayDate(expectedLocalDate));
    expect(screen.getByLabelText(/fecha de pago/i)).toHaveTextContent(displayDate(expectedLocalDate));
  });

  it("renders the empty-state fallback option and blocks submission via required-field validation when there are zero active employees", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PayrollPaymentFormDialog employees={[]} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />);

    await openDialog(user);

    const employeeSelect = await screen.findByLabelText(/empleado/i);
    await user.click(employeeSelect);
    expect(await screen.findByRole("option", { name: "Sin empleados activos" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(employeeSelect).toHaveTextContent(/selecciona un empleado/i);

    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/empleado requerido/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks submission client-side when paymentDate is cleared via the DatePicker's toggle-to-clear gesture (no request sent)", async () => {
    // `paymentDate` is required (`payrollPaymentFormSchema`'s
    // `z.string().trim().min(1, ...)`), mirroring `invoice-form-content.test.tsx`'s
    // "blocks submission client-side when issueDate is cleared..." precedent.
    // Unlike `referenceDate`, `paymentDate` does not drive the live period
    // preview, so no preview assertion is needed here.
    const user = userEvent.setup();
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
    );

    await openDialog(user);
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");

    // Pick a non-today day first so the clear-gesture lookup (`clearDay`)
    // never collides with react-day-picker's "Hoy, " accessible-name prefix.
    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha de pago/i, dayLabel);
    await clearDay(user, /fecha de pago/i, dayLabel);

    expect(screen.getByLabelText(/fecha de pago/i)).toHaveTextContent(/seleccionar fecha/i);

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/fecha de pago requerida/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("live period preview", () => {
    it("shows the quincenal first-half range for a reference date in the first half of the month", async () => {
      const user = userEvent.setup();
      vi.setSystemTime(new Date(2026, 6, 7));
      render(
        <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
      );

      await openDialog(user);
      const targetDate = new Date(2026, 6, 5);
      const dayLabel = format(targetDate, "PPPP", { locale: es });
      await pickDay(user, /fecha de referencia/i, dayLabel);

      const expected = computePeriod("quincenal", "2026-07-05");
      const expectedDays = periodDays(expected.periodStart, expected.periodEnd);
      const preview = await screen.findByTestId("payroll-period-preview");
      expect(preview).toHaveTextContent(expected.periodStart);
      expect(preview).toHaveTextContent(expected.periodEnd);
      expect(preview).toHaveTextContent(`${expectedDays}`);
    });

    it("updates the preview when the reference date crosses the 15th/16th boundary (quincenal), picked via the Calendar", async () => {
      // THE single most important test in this change: proves the
      // `useWatch({ control, name: "referenceDate" })` -> `computePeriod`/
      // `periodDays` preview wiring (byte-for-byte unchanged per design.md)
      // still reacts correctly when `referenceDate` is now driven by
      // `Controller`'s `field.onChange` (via the Calendar UI) instead of
      // `register()`'s native `onChange` — not just that the field's value
      // changes, but that the LIVE preview text re-renders with the
      // correctly recomputed range for each newly picked date.
      const user = userEvent.setup();
      vi.setSystemTime(new Date(2026, 6, 1));
      render(
        <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
      );

      await openDialog(user);

      const day15 = new Date(2026, 6, 15);
      const day15Label = format(day15, "PPPP", { locale: es });
      await pickDay(user, /fecha de referencia/i, day15Label);

      const firstHalf = computePeriod("quincenal", "2026-07-15");
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(`${firstHalf.periodStart}`);
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${firstHalf.periodEnd}`);

      // Re-open the picker and pick the 16th — crossing the quincenal
      // boundary — proving the preview recomputes AGAIN for the new date,
      // not just once on first pick.
      const day16 = new Date(2026, 6, 16);
      const day16Label = format(day16, "PPPP", { locale: es });
      await pickDay(user, /fecha de referencia/i, day16Label);

      const secondHalf = computePeriod("quincenal", "2026-07-16");
      expect(secondHalf.periodStart).not.toBe(firstHalf.periodStart);
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(`${secondHalf.periodStart}`);
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${secondHalf.periodEnd}`);
    });

    it("updates the preview when periodType toggles between quincenal and mensual for the same Calendar-picked reference date", async () => {
      const user = userEvent.setup();
      vi.setSystemTime(new Date(2026, 6, 7));
      render(
        <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
      );

      await openDialog(user);
      const targetDate = new Date(2026, 6, 20);
      const dayLabel = format(targetDate, "PPPP", { locale: es });
      await pickDay(user, /fecha de referencia/i, dayLabel);

      const quincenal = computePeriod("quincenal", "2026-07-20");
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(`${quincenal.periodStart}`);
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${quincenal.periodEnd}`);

      await selectOption(user, /tipo de periodo/i, "Mensual");

      const mensual = computePeriod("mensual", "2026-07-20");
      expect(mensual.periodStart).not.toBe(quincenal.periodStart);
      expect(await screen.findByTestId("payroll-period-preview")).toHaveTextContent(`${mensual.periodStart}`);
      expect(screen.getByTestId("payroll-period-preview")).toHaveTextContent(`${mensual.periodEnd}`);
    });

    it("hides the preview and blocks submission client-side when referenceDate is cleared via the DatePicker's toggle-to-clear gesture (no request sent)", async () => {
      // `referenceDate` is required (`payrollPaymentFormSchema`'s
      // `z.string().trim().min(1, ...)`), mirroring
      // `invoice-form-content.test.tsx`'s "blocks submission client-side when
      // issueDate is cleared..." precedent. `referenceDate` ALSO drives the
      // live period preview via
      // `referenceDate && !Number.isNaN(Date.parse(referenceDate))` (see
      // `payroll-payment-form-dialog-content.tsx`) — once cleared back to
      // `""`, that guard is falsy and the preview `<p data-testid=
      // "payroll-period-preview">` is not rendered at all (rather than
      // continuing to show the previously-computed, now-stale range), so this
      // test proves both the validation-blocking AND the preview's graceful
      // disappearance.
      const user = userEvent.setup();
      vi.setSystemTime(new Date(2026, 6, 7));
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      render(
        <PayrollPaymentFormDialog employees={EMPLOYEES} periodTypes={PERIOD_TYPES} trigger={<button type="button">Registrar pago</button>} />,
      );

      await openDialog(user);
      await user.clear(screen.getByLabelText(/monto/i));
      await user.type(screen.getByLabelText(/monto/i), "500");

      // Pick a non-today day first so the clear-gesture lookup (`clearDay`)
      // never collides with react-day-picker's "Hoy, " accessible-name prefix.
      const targetDate = new Date(2026, 6, 20);
      const dayLabel = format(targetDate, "PPPP", { locale: es });
      await pickDay(user, /fecha de referencia/i, dayLabel);

      expect(await screen.findByTestId("payroll-period-preview")).toBeInTheDocument();

      await clearDay(user, /fecha de referencia/i, dayLabel);

      expect(screen.getByLabelText(/fecha de referencia/i)).toHaveTextContent(/seleccionar fecha/i);
      expect(screen.queryByTestId("payroll-period-preview")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /guardar/i }));

      expect(await screen.findByText(/fecha de referencia requerida/i)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("payroll-period-preview")).not.toBeInTheDocument();
    });
  });
});
