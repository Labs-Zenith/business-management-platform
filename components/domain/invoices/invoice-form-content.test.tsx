import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatCOP, lineTotal, pesosToCents } from "@/lib/money";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import InvoiceFormContent from "./invoice-form-content";

const CUSTOMER = { id: "60000000-0000-4000-8000-000000000001", name: "Cliente Uno" };

// `getByText`'s default normalizer collapses ALL whitespace (including
// `formatCOP`'s real NBSP) to a regular space, so the query string must be
// normalized the same way to match — see
// `components/domain/dashboard/expense-kpi-cards.test.tsx` for the same
// convention.
const normalizeMoney = (value: string) => value.replace(/ /g, " ");

describe("InvoiceFormContent", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function fillFirstItem(user: ReturnType<typeof userEvent.setup>, description: string, unitPrice: string) {
    await user.type(screen.getByLabelText(/descripcion/i), description);
    await user.clear(screen.getByLabelText(/valor unitario/i));
    await user.type(screen.getByLabelText(/valor unitario/i), unitPrice);
  }

  it("POSTs items with unitPrice converted to integer cents to /api/invoices, then pushes and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "invoice-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoiceFormContent customers={[CUSTOMER]} />);

    await user.selectOptions(screen.getByLabelText(/cliente/i), CUSTOMER.id);
    await fillFirstItem(user, "Consultoria", "500");
    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/invoices", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.customerId).toBe(CUSTOMER.id);
    expect(body.items).toEqual([{ description: "Consultoria", quantity: 1, unitPrice: 50000 }]);
    expect(pushMock).toHaveBeenCalledWith("/invoices/invoice-1");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { typed: "1.005", expectedCents: 101 },
    { typed: "8.575", expectedCents: 858 },
    { typed: "5.015", expectedCents: 502 },
  ])(
    "converts a $typed unitPrice in pesos to $expectedCents cents without IEEE-754 rounding-down artifacts",
    async ({ typed, expectedCents }) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} />);

      await user.selectOptions(screen.getByLabelText(/cliente/i), CUSTOMER.id);
      await fillFirstItem(user, "Consultoria", typed);
      await user.click(screen.getByRole("button", { name: /crear factura/i }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.items[0].unitPrice).toBe(expectedCents);
    },
  );

  it("defaults the issue date field to LOCAL today's date, not UTC's, even when local time has rolled into the next UTC day", async () => {
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

    const expectedLocalDate = `${pinnedInstant.getFullYear()}-${String(pinnedInstant.getMonth() + 1).padStart(2, "0")}-${String(pinnedInstant.getDate()).padStart(2, "0")}`;
    const expectedUtcDate = pinnedInstant.toISOString().slice(0, 10);

    render(<InvoiceFormContent customers={[CUSTOMER]} />);

    const dateInput = screen.getByLabelText(/fecha de emision/i);

    expect(dateInput).toHaveValue(expectedLocalDate);
    if (expectedLocalDate !== expectedUtcDate) {
      expect(dateInput).not.toHaveValue(expectedUtcDate);
    }
  });

  it("renders a running total that matches lineTotal(quantity, pesosToCents(unitPrice)) for a non-1 quantity", async () => {
    // quantity !== 1 so the round-half-up order-of-operations actually matters:
    // `lineTotal(quantity, pesosToCents(unitPrice))` (cents rounded first, then
    // multiplied) must be exactly what's rendered — not a naive
    // `Math.round(quantity * unitPrice * 100)` computed in one shot.
    const user = userEvent.setup();
    render(<InvoiceFormContent customers={[CUSTOMER]} />);

    await user.type(screen.getByLabelText(/descripcion/i), "Consultoria");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "3");
    await user.clear(screen.getByLabelText(/valor unitario/i));
    await user.type(screen.getByLabelText(/valor unitario/i), "8.575");

    const expectedCents = lineTotal(3, pesosToCents(8.575));
    expect(await screen.findByText(normalizeMoney(formatCOP(expectedCents)))).toBeInTheDocument();
  });

  it("renders a running total that is the SUM of each line item's lineTotal across multiple items", async () => {
    const user = userEvent.setup();
    render(<InvoiceFormContent customers={[CUSTOMER]} />);

    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "3");
    await user.clear(screen.getByLabelText(/valor unitario/i));
    await user.type(screen.getByLabelText(/valor unitario/i), "8.575");

    await user.click(screen.getByRole("button", { name: /agregar item/i }));

    const quantityInputs = screen.getAllByLabelText(/cantidad/i);
    const unitPriceInputs = screen.getAllByLabelText(/valor unitario/i);
    await user.clear(quantityInputs[1]);
    await user.type(quantityInputs[1], "2");
    await user.clear(unitPriceInputs[1]);
    await user.type(unitPriceInputs[1], "5.015");

    const expectedCents = lineTotal(3, pesosToCents(8.575)) + lineTotal(2, pesosToCents(5.015));
    expect(await screen.findByText(normalizeMoney(formatCOP(expectedCents)))).toBeInTheDocument();
  });

  it("shows the server error message and does not navigate when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Cliente invalido." } }),
      }),
    );

    render(<InvoiceFormContent customers={[CUSTOMER]} />);

    await user.selectOptions(screen.getByLabelText(/cliente/i), CUSTOMER.id);
    await fillFirstItem(user, "Consultoria", "500");
    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cliente invalido.");
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
