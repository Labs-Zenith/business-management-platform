import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { clearDay, pickDay } from "@/components/ui/date-picker-test-helpers";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import PaymentFormDialog from "./payment-form-dialog-content";

const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

describe("PaymentFormDialog", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the current pending balance", async () => {
    const user = userEvent.setup();
    render(
      <PaymentFormDialog invoiceId={INVOICE_ID} balance={200000} trigger={<button type="button">Registrar pago</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /registrar pago/i }));

    expect(await screen.findByText(/\$\s?2[.,]000/)).toBeInTheDocument();
  });

  it("POSTs the amount converted to integer cents to /api/invoices/{id}/payments, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: INVOICE_ID, balance: 120000, status: "partially_paid" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentFormDialog invoiceId={INVOICE_ID} balance={200000} trigger={<button type="button">Registrar pago</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /registrar pago/i }));
    await user.type(await screen.findByLabelText(/monto/i), "800");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/invoices/${INVOICE_ID}/payments`,
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.amount).toBe(80000);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("disables the submit button and shows an inline message when the amount exceeds the balance (client-side UX cap)", async () => {
    const user = userEvent.setup();
    render(
      <PaymentFormDialog invoiceId={INVOICE_ID} balance={100000} trigger={<button type="button">Registrar pago</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /registrar pago/i }));
    await user.type(await screen.findByLabelText(/monto/i), "5000"); // 500,000 cents > 100,000 balance

    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/no puede exceder el saldo pendiente/i)).toBeInTheDocument();
  });

  it("shows a live inline error and disables the submit button when amount is zero, then enables it once a valid amount is entered", async () => {
    const user = userEvent.setup();
    render(
      <PaymentFormDialog invoiceId={INVOICE_ID} balance={200000} trigger={<button type="button">Registrar pago</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /registrar pago/i }));
    await user.click(screen.getByLabelText(/monto/i));
    await user.tab();

    expect(await screen.findByText(/demasiado peque/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/monto/i), "800");

    await waitFor(() => expect(screen.queryByText(/demasiado peque/i)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled();
  });

  it("shows the server error message and does not refresh when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "El monto excede el saldo." } }),
      }),
    );

    render(
      <PaymentFormDialog invoiceId={INVOICE_ID} balance={200000} trigger={<button type="button">Registrar pago</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /registrar pago/i }));
    await user.type(await screen.findByLabelText(/monto/i), "1000");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El monto excede el saldo.");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  // `MoneyInput` (COP mask) caps entry at 2 decimals and uses "," as the
  // decimal separator, so a 3-decimal (half-cent) peso amount can no longer
  // be typed through this UI at all — that exact IEEE-754 edge case is still
  // covered directly at the unit level by `lib/money.test.ts`'s
  // `pesosToCents` tests (unchanged). These cases now exercise a 2-decimal
  // comma-typed amount that round-trips to the SAME expected cents value,
  // proving the mask + `pesosToCents` conversion still works end-to-end.
  it.each([
    { typed: "1,01", expectedCents: 101 },
    { typed: "8,58", expectedCents: 858 },
    { typed: "5,02", expectedCents: 502 },
  ])(
    "converts $typed pesos (comma decimal) to $expectedCents cents through the MoneyInput mask",
    async ({ typed, expectedCents }) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: INVOICE_ID, balance: 0, status: "paid" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <PaymentFormDialog
          invoiceId={INVOICE_ID}
          balance={200000}
          trigger={<button type="button">Registrar pago</button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: /registrar pago/i }));
      await user.type(await screen.findByLabelText(/monto/i), typed);
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.amount).toBe(expectedCents);
    },
  );

  it("defaults the date field to LOCAL today's date, not UTC's, even when local time has rolled into the next UTC day", async () => {
    // Pin a single fixed instant: 2026-07-06T23:30:00-05:00, i.e. 2026-07-07T04:30:00Z.
    // For a UTC-5 zone (Colombia, no DST) this is evening-local but already the NEXT
    // day in UTC — exactly the case where `.toISOString().slice(0, 10)` (UTC-based)
    // would silently disagree with the user's local calendar date.
    //
    // The expected value below is derived from the SAME pinned instant using local
    // Date getters (not a hardcoded "2026-07-06" literal), so this assertion is
    // correct regardless of the timezone the test process itself happens to run in.
    const pinnedInstant = new Date("2026-07-07T04:30:00Z");
    vi.setSystemTime(pinnedInstant);

    const expectedLocalDate = new Date(
      pinnedInstant.getFullYear(),
      pinnedInstant.getMonth(),
      pinnedInstant.getDate(),
    );
    const expectedLocalDateIso = `${expectedLocalDate.getFullYear()}-${String(expectedLocalDate.getMonth() + 1).padStart(2, "0")}-${String(expectedLocalDate.getDate()).padStart(2, "0")}`;
    const expectedUtcDateIso = pinnedInstant.toISOString().slice(0, 10);
    const expectedDisplayText = format(expectedLocalDate, "d MMM yyyy", { locale: es });

    const user = userEvent.setup();
    render(
      <PaymentFormDialog invoiceId={INVOICE_ID} balance={200000} trigger={<button type="button">Registrar pago</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /registrar pago/i }));

    // `DatePicker`'s trigger is a `<button>`, not a native `<input>`, so the
    // default value is asserted via its displayed text (`"d MMM yyyy"`
    // formatted, `es` locale) rather than `.toHaveValue()`.
    expect(await screen.findByLabelText(/fecha/i)).toHaveTextContent(expectedDisplayText);
    if (expectedLocalDateIso !== expectedUtcDateIso) {
      const buggyDisplayText = format(
        new Date(`${expectedUtcDateIso}T00:00:00`),
        "d MMM yyyy",
        { locale: es },
      );
      expect(screen.getByLabelText(/fecha/i)).not.toHaveTextContent(buggyDisplayText);
    }
  });

  it("blocks submission client-side when paymentDate is cleared via the DatePicker's toggle-to-clear gesture (no request sent)", async () => {
    // `paymentDate` is required (`lib/schemas/payment.ts`'s `dateSchema`,
    // `z.string().trim().min(1, ...)`) via the shared `useZodForm` hook. The
    // `DatePicker`'s `onChange` marks the field `touched` immediately (it has
    // no native blur to hook into), so the live inline error appears right
    // after the clear gesture — the submit button also becomes disabled.
    const user = userEvent.setup();
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentFormDialog invoiceId={INVOICE_ID} balance={200000} trigger={<button type="button">Registrar pago</button>} />,
    );

    await user.click(screen.getByRole("button", { name: /registrar pago/i }));
    await user.type(await screen.findByLabelText(/monto/i), "800");

    // Pick a non-today day first so the clear-gesture lookup (`clearDay`)
    // never collides with react-day-picker's "Hoy, " accessible-name prefix.
    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha/i, dayLabel);
    await clearDay(user, /fecha/i, dayLabel);

    expect(screen.getByLabelText(/fecha/i)).toHaveTextContent(/seleccionar fecha/i);
    expect(await screen.findByText(/demasiado peque/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
