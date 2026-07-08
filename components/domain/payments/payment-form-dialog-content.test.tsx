import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
});
