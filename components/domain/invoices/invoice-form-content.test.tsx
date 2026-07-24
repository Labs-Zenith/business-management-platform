import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCOP, lineTotal, pesosToCents } from "@/lib/money";
import { clearDay, displayDate, pickDay } from "@/components/ui/date-picker-test-helpers";
import { selectOption } from "@/components/ui/select-test-helpers";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import InvoiceFormContent from "./invoice-form-content";

const CUSTOMER = { id: "60000000-0000-4000-8000-000000000001", name: "Cliente Uno" };

// Includes the `venta` code so `defaultInvoiceTypeId` (`invoice-form-content.tsx`)
// resolves the same create-mode default the real catalog would.
const INVOICE_TYPES = [
  { id: "f1000000-0000-4000-8000-000000000001", code: "venta", label: "Factura de venta" },
  { id: "f1000000-0000-4000-8000-000000000002", code: "nota_credito", label: "Nota crédito" },
];

// Empty by default in most tests below (only "Otro…" is offered) — the
// dedicated "Selector de producto" describe block further down passes a
// non-empty `products` list to exercise the real-product path.
const PRODUCTS: { id: string; name: string; currentQuantity: number }[] = [];

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

  // Picks "Otro…" on the first item's product Select (always the last/only
  // option when `products` is empty — see the `PRODUCTS` fixture above),
  // which reveals the free-text description `<Input>`, then fills it plus
  // `unitPrice` — mirrors the pre-Select "fill description" step this
  // helper replaced.
  async function fillFirstItem(user: ReturnType<typeof userEvent.setup>, description: string, unitPrice: string) {
    await selectOption(user, /producto/i, /otro/i);
    await user.type(screen.getByLabelText(/descripción/i), description);
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

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await fillFirstItem(user, "Consultoria", "500");
    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/invoices", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.customerId).toBe(CUSTOMER.id);
    expect(body.items).toEqual([{ description: "Consultoria", quantity: 1, unitPrice: 50000, productId: null }]);
    // Pre-selected to the `venta` catalog type by `defaultInvoiceTypeId`
    // (never touched by the user in this test) — see the dedicated
    // "Tipo de factura" tests below for the explicit-pick case.
    expect(body.invoiceTypeId).toBe(INVOICE_TYPES[0]!.id);
    expect(pushMock).toHaveBeenCalledWith("/invoices/invoice-1");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  describe("Tipo de factura", () => {
    it("defaults the Select to the catalog's 'venta' type and submits its id when never touched", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

      expect(screen.getByLabelText(/tipo de factura/i)).toHaveTextContent(INVOICE_TYPES[0]!.label);

      await selectOption(user, /cliente/i, CUSTOMER.name);
      await fillFirstItem(user, "Consultoria", "500");
      await user.click(screen.getByRole("button", { name: /crear factura/i }));

      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.invoiceTypeId).toBe(INVOICE_TYPES[0]!.id);
    });

    it("submits the newly picked invoice type's id when the user changes the Select", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

      await selectOption(user, /cliente/i, CUSTOMER.name);
      await fillFirstItem(user, "Consultoria", "500");
      await selectOption(user, /tipo de factura/i, INVOICE_TYPES[1]!.label);
      await user.click(screen.getByRole("button", { name: /crear factura/i }));

      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.invoiceTypeId).toBe(INVOICE_TYPES[1]!.id);
    });

    it("is not rendered in edit mode and is never sent in the PATCH payload (the invoice type is immutable after creation)", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <InvoiceFormContent
          customers={[CUSTOMER]}
          invoiceTypes={INVOICE_TYPES}
          products={PRODUCTS}
          invoice={{
            id: "invoice-1",
            customerId: CUSTOMER.id,
            issueDate: "2026-06-01",
            dueDate: "2026-06-30",
            notes: "",
            items: [{ description: "Consultoria previa", quantity: 1, unitPrice: 100000, productId: null }],
            paidAmount: 0,
          }}
        />,
      );

      expect(screen.queryByLabelText(/tipo de factura/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body).not.toHaveProperty("invoiceTypeId");
    });
  });

  it("blocks submission client-side and shows a validation error when an item's unitPrice is left empty (no request sent)", async () => {
    // `unitPrice` defaults to `""` (see `invoice-form-content.tsx`'s
    // `toDefaultValues`) and `invoiceItemFormSchema`'s first `.refine` checks
    // `value !== ""` explicitly, distinct from the second `.refine`'s
    // "No puede ser negativo" message — this proves the empty case renders
    // its own "Requerido" error (not the negative-value message) and blocks
    // the request, mirroring `expense-form-dialog-content.test.tsx`'s
    // "blocks submission client-side ... when amount is not greater than 0"
    // precedent.
    //
    // Live (`mode: "onTouched"`) validation: the error surfaces on BLUR
    // (once `unitPrice` is touched), and the submit button itself is
    // disabled while the form is invalid — clicking it is a no-op, not the
    // trigger for the error.
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await selectOption(user, /producto/i, /otro/i);
    await user.type(screen.getByLabelText(/descripción/i), "Consultoria");
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "1");
    // unitPrice left at its default ("") — invalid, must be non-empty
    await user.click(screen.getByLabelText(/valor unitario/i));
    await user.tab();

    expect(await screen.findByText(/^requerido$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear factura/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /crear factura/i }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // `MoneyInput` (COP mask) caps entry at 2 decimals and uses "," as the
  // decimal separator, so a 3-decimal (half-cent) peso amount can no longer
  // be typed through this UI at all — that exact IEEE-754 edge case is still
  // covered directly at the unit level by `lib/money.test.ts`'s
  // `pesosToCents` tests (unchanged). These cases now exercise a 2-decimal
  // comma-typed amount that round-trips to the SAME expected cents value.
  it.each([
    { typed: "1,01", expectedCents: 101 },
    { typed: "8,58", expectedCents: 858 },
    { typed: "5,02", expectedCents: 502 },
  ])(
    "converts a $typed unitPrice in pesos (comma decimal) to $expectedCents cents through the MoneyInput mask",
    async ({ typed, expectedCents }) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

      await selectOption(user, /cliente/i, CUSTOMER.name);
      await fillFirstItem(user, "Consultoria", typed);
      await user.click(screen.getByRole("button", { name: /crear factura/i }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.items[0].unitPrice).toBe(expectedCents);
    },
  );

  it("defaults the issue date trigger to LOCAL today's date, not UTC's, even when local time has rolled into the next UTC day", async () => {
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

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    // The native `type="date"` input is gone — the trigger is now a `<button>`
    // labeled via `<Label htmlFor>`, displaying the `DatePicker`'s "d MMM yyyy"
    // formatted text instead of an ISO `value`.
    const trigger = screen.getByLabelText(/fecha de emisión/i);

    expect(trigger).toHaveTextContent(displayDate(expectedLocalDate));
    if (expectedLocalDate !== expectedUtcDate) {
      expect(trigger).not.toHaveTextContent(displayDate(expectedUtcDate));
    }
  });

  it("allows picking a new issueDate via the Calendar and submits it as the ISO payload value", async () => {
    const user = userEvent.setup();
    // Pin "today" so the Calendar opens on a known month without navigation.
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "invoice-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await fillFirstItem(user, "Consultoria", "500");

    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha de emisión/i, dayLabel);

    expect(screen.getByLabelText(/fecha de emisión/i)).toHaveTextContent("20 jul 2026");

    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.issueDate).toBe("2026-07-20");
  });

  it("blocks submission client-side when issueDate is cleared via the DatePicker's toggle-to-clear gesture (no request sent)", async () => {
    // `issueDate` is required (`invoiceFormSchema`'s `z.string().trim().min(1, ...)`).
    // `DatePicker` exposes a real clear gesture — re-clicking the
    // already-selected day — that RHF's `Controller` must wire back to `""`
    // so the resolver actually rejects submission, not just "field never
    // touched" (see the separate "omits dueDate ... never touched" test,
    // which does NOT exercise this gesture at all).
    //
    // `DatePicker` has no `onBlur` prop to wire to RHF's `Controller` field,
    // so this field can never become "touched" via blur the way text/
    // `MoneyInput`/`Select` fields can — live validation here surfaces as
    // the submit button itself going disabled (`formState.isValid`), not an
    // inline message under this specific field.
    const user = userEvent.setup();
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await fillFirstItem(user, "Consultoria", "500");

    // Pick a non-today day first so the clear-gesture lookup (`clearDay`)
    // never collides with react-day-picker's "Hoy, " accessible-name prefix.
    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha de emisión/i, dayLabel);
    await clearDay(user, /fecha de emisión/i, dayLabel);

    expect(screen.getByLabelText(/fecha de emisión/i)).toHaveTextContent(/seleccionar fecha/i);

    expect(await screen.findByRole("button", { name: /crear factura/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /crear factura/i }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows picking an optional dueDate via the Calendar and includes it as ISO in the payload", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "invoice-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    // dueDate is optional/clearable — no forced default, placeholder shown until picked.
    expect(screen.getByLabelText(/fecha de vencimiento/i)).toHaveTextContent(/seleccionar fecha/i);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await fillFirstItem(user, "Consultoria", "500");

    const targetDate = new Date(2026, 6, 25);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha de vencimiento/i, dayLabel);

    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.dueDate).toBe("2026-07-25");
  });

  it("omits dueDate from the payload when left unset", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "invoice-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await fillFirstItem(user, "Consultoria", "500");
    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("dueDate");
  });

  it("omits dueDate from the payload when a picked date is cleared via the DatePicker's toggle-to-clear gesture", async () => {
    // Unlike the "never touched" test above, this one actually PICKS a
    // dueDate first (so the field holds a real value) and then re-clicks
    // that same day to clear it, proving the clear gesture itself round-trips
    // correctly through the `Controller` wiring down to `""`, which
    // `onSubmit` (`invoice-form-content.tsx`) then omits via
    // `...(values.dueDate ? { dueDate: values.dueDate } : {})`.
    const user = userEvent.setup();
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "invoice-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await fillFirstItem(user, "Consultoria", "500");

    const targetDate = new Date(2026, 6, 25);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha de vencimiento/i, dayLabel);
    expect(screen.getByLabelText(/fecha de vencimiento/i)).toHaveTextContent("25 jul 2026");

    await clearDay(user, /fecha de vencimiento/i, dayLabel);
    expect(screen.getByLabelText(/fecha de vencimiento/i)).toHaveTextContent(/seleccionar fecha/i);

    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("dueDate");
  });

  it("renders a running total that matches lineTotal(quantity, pesosToCents(unitPrice)) for a non-1 quantity", async () => {
    // quantity !== 1 so the round-half-up order-of-operations actually matters:
    // `lineTotal(quantity, pesosToCents(unitPrice))` (cents rounded first, then
    // multiplied) must be exactly what's rendered — not a naive
    // `Math.round(quantity * unitPrice * 100)` computed in one shot.
    // `MoneyInput` (COP mask) caps entry at 2 decimals and uses "," as the
    // decimal separator, so the unitPrice below is typed as "8,58" (comma) —
    // the pure-function order-of-operations logic itself is unchanged and
    // still exercised by `lib/money.test.ts`'s dedicated `lineTotal`/
    // `pesosToCents` unit tests with 3-decimal inputs.
    const user = userEvent.setup();
    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    // The running total only depends on quantity/unitPrice, not on
    // description/productId — no need to pick a product here.
    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "3");
    await user.clear(screen.getByLabelText(/valor unitario/i));
    await user.type(screen.getByLabelText(/valor unitario/i), "8,58");

    const expectedCents = lineTotal(3, pesosToCents(8.58));
    expect(await screen.findByText(normalizeMoney(formatCOP(expectedCents)))).toBeInTheDocument();
  });

  it("renders a running total that is the SUM of each line item's lineTotal across multiple items", async () => {
    const user = userEvent.setup();
    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await user.clear(screen.getByLabelText(/cantidad/i));
    await user.type(screen.getByLabelText(/cantidad/i), "3");
    await user.clear(screen.getByLabelText(/valor unitario/i));
    await user.type(screen.getByLabelText(/valor unitario/i), "8,58");

    await user.click(screen.getByRole("button", { name: /agregar item/i }));

    const quantityInputs = screen.getAllByLabelText(/cantidad/i);
    const unitPriceInputs = screen.getAllByLabelText(/valor unitario/i);
    await user.clear(quantityInputs[1]);
    await user.type(quantityInputs[1], "2");
    await user.clear(unitPriceInputs[1]);
    await user.type(unitPriceInputs[1], "5,02");

    const expectedCents = lineTotal(3, pesosToCents(8.58)) + lineTotal(2, pesosToCents(5.02));
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

    render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

    await selectOption(user, /cliente/i, CUSTOMER.name);
    await fillFirstItem(user, "Consultoria", "500");
    await user.click(screen.getByRole("button", { name: /crear factura/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cliente invalido.");
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  describe("edit mode", () => {
    const INVOICE = {
      id: "invoice-1",
      customerId: CUSTOMER.id,
      issueDate: "2026-06-01",
      dueDate: "2026-06-30",
      notes: "Nota existente",
      items: [
        { description: "Consultoria previa", quantity: 2, unitPrice: 150000, productId: null }, // 1500.00 pesos in cents
      ],
      paidAmount: 0, // zero payments — below-paid-total warning never applies to these tests
    };

    it("pre-fills every field from the invoice prop, converting cents back to whole pesos", async () => {
      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} invoice={INVOICE} />);

      // The native `<select>`'s `toHaveValue(id)` assertion is gone — the
      // trigger is now a `<button role="combobox">` displaying the selected
      // customer's NAME (resolved via the `items` prop), not the raw id.
      expect(screen.getByLabelText(/cliente/i)).toHaveTextContent(CUSTOMER.name);
      expect(screen.getByLabelText(/fecha de emisión/i)).toHaveTextContent(displayDate(INVOICE.issueDate));
      expect(screen.getByLabelText(/fecha de vencimiento/i)).toHaveTextContent(displayDate(INVOICE.dueDate));
      expect(screen.getByLabelText(/nota/i)).toHaveValue(INVOICE.notes);
      expect(screen.getByLabelText(/descripción/i)).toHaveValue(INVOICE.items[0].description);
      expect(screen.getByLabelText(/cantidad/i)).toHaveValue(INVOICE.items[0].quantity);
      // Displayed value is COP-grouped ("1.500" pesos), not the raw "1500".
      expect(screen.getByLabelText(/valor unitario/i)).toHaveValue("1.500");
    });

    it("renders the 'Guardar cambios' submit label instead of 'Crear factura'", () => {
      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} invoice={INVOICE} />);

      expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^crear factura$/i })).not.toBeInTheDocument();
    });

    it("PATCHes /api/invoices/{id} with the edited payload (cents-converted unitPrice) instead of POSTing, then pushes and refreshes on success", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: INVOICE.id } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} invoice={INVOICE} />);

      await user.clear(screen.getByLabelText(/valor unitario/i));
      await user.type(screen.getByLabelText(/valor unitario/i), "2000");
      await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/invoices/${INVOICE.id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.customerId).toBe(CUSTOMER.id);
      expect(body.items).toEqual([
        { description: INVOICE.items[0].description, quantity: 2, unitPrice: 200000, productId: null },
      ]);
      expect(body.issueDate).toBe(INVOICE.issueDate);
      expect(body.dueDate).toBe(INVOICE.dueDate);
      expect(pushMock).toHaveBeenCalledWith(`/invoices/${INVOICE.id}`);
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("allows changing dueDate via the Calendar in edit mode and submits the newly picked ISO date", async () => {
      const user = userEvent.setup();
      // Pin "today" close to the invoice's existing dates so the Calendar opens
      // on that month without navigation.
      vi.setSystemTime(new Date(2026, 5, 1));
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: INVOICE.id } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} invoice={INVOICE} />);

      const targetDate = new Date(2026, 5, 15);
      const dayLabel = format(targetDate, "PPPP", { locale: es });
      await pickDay(user, /fecha de vencimiento/i, dayLabel);

      await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.dueDate).toBe("2026-06-15");
    });

    it("shows the edit-specific server error message and does not navigate when the PATCH fails", async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: async () => ({ error: { code: "CONFLICT", message: "La factura ya tiene pagos registrados." } }),
        }),
      );

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} invoice={INVOICE} />);

      await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent("La factura ya tiene pagos registrados.");
      expect(pushMock).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  describe("edit mode — below-paid-total warning", () => {
    // 2 x 150000 cents (1500 pesos) = 300000 cents total, matching `INVOICE`
    // above — `paidAmount` is set BELOW that initial total so the warning is
    // NOT shown on first render (only once the live total is edited down
    // past it), per `invoice-edit-partial`'s relaxed edit-lock rule: the
    // server rejects a new total below `paidAmount`, this is the UX-only
    // early warning mirroring that rule client-side.
    const PARTIALLY_PAID_INVOICE = {
      id: "invoice-1",
      customerId: CUSTOMER.id,
      issueDate: "2026-06-01",
      dueDate: "2026-06-30",
      notes: "Nota existente",
      items: [{ description: "Consultoria previa", quantity: 2, unitPrice: 150_000, productId: null }], // total = 300000 cents
      paidAmount: 250_000,
    };

    it("shows the below-paid-total warning and disables submit once the live total drops below paidAmount", async () => {
      const user = userEvent.setup();
      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} invoice={PARTIALLY_PAID_INVOICE} />);

      // Initial total (300000) >= paidAmount (250000): no warning, submit enabled.
      // `findByRole` (not `getByRole`): `formState.isValid` settles
      // asynchronously (an effect-driven validation pass) once `mode:
      // "onTouched"` + subscribing to `isValid` are both in play, so the
      // very first synchronous render may still show the pre-validation
      // default before it resolves to the actual (valid, here) result.
      expect(screen.queryByText(/no puede ser menor a lo ya pagado/i)).not.toBeInTheDocument();
      expect(await screen.findByRole("button", { name: /guardar cambios/i })).toBeEnabled();

      // Drop unitPrice to 1000 pesos: new total = lineTotal(2, pesosToCents(1000)) = 200000 < 250000.
      await user.clear(screen.getByLabelText(/valor unitario/i));
      await user.type(screen.getByLabelText(/valor unitario/i), "1000");

      expect(
        await screen.findByText(normalizeMoney(`El total no puede ser menor a lo ya pagado (${formatCOP(250_000)}).`)),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
    });

    it("re-enables submit and hides the warning once the live total is raised back to at least paidAmount", async () => {
      const user = userEvent.setup();
      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} invoice={PARTIALLY_PAID_INVOICE} />);

      await user.clear(screen.getByLabelText(/valor unitario/i));
      await user.type(screen.getByLabelText(/valor unitario/i), "1000");
      expect(await screen.findByText(/no puede ser menor a lo ya pagado/i)).toBeInTheDocument();

      // Raise unitPrice back to 1500 pesos: new total = lineTotal(2, pesosToCents(1500)) = 300000 >= 250000.
      await user.clear(screen.getByLabelText(/valor unitario/i));
      await user.type(screen.getByLabelText(/valor unitario/i), "1500");

      expect(screen.queryByText(/no puede ser menor a lo ya pagado/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeEnabled();
    });

    it("never applies the warning in create mode (no invoice prop, no paidAmount)", async () => {
      // A brand-new create-mode form starts with a blank item (empty
      // `description`/`unitPrice`), which is itself invalid per
      // `invoiceItemFormSchema` — so submit starts disabled regardless of
      // the below-paid-total warning; filling valid values first isolates
      // this test to what it actually asserts (the warning never applies
      // here), rather than conflating it with the unrelated blank-item case
      // already covered by "blocks submission client-side ... unitPrice is
      // left empty" above.
      const user = userEvent.setup();
      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

      await selectOption(user, /cliente/i, CUSTOMER.name);
      await fillFirstItem(user, "Consultoria", "500");

      expect(screen.queryByText(/no puede ser menor a lo ya pagado/i)).not.toBeInTheDocument();
      expect(await screen.findByRole("button", { name: /crear factura/i })).toBeEnabled();
    });
  });

  describe("create mode regression", () => {
    it("still POSTs to /api/invoices (not PATCH) and shows 'Crear factura' when no invoice prop is passed", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-2" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={PRODUCTS} />);

      expect(screen.getByRole("button", { name: /crear factura/i })).toBeInTheDocument();

      await selectOption(user, /cliente/i, CUSTOMER.name);
      await fillFirstItem(user, "Consultoria", "500");
      await user.click(screen.getByRole("button", { name: /crear factura/i }));

      expect(fetchMock).toHaveBeenCalledWith("/api/invoices", expect.objectContaining({ method: "POST" }));
      expect(pushMock).toHaveBeenCalledWith("/invoices/invoice-2");
    });
  });

  describe("Selector de producto (línea de factura)", () => {
    const PRODUCT_A = { id: "80000000-0000-4000-8000-000000000001", name: "Tornillos 1/4", currentQuantity: 12 };
    const PRODUCT_B = { id: "80000000-0000-4000-8000-000000000002", name: "Martillos", currentQuantity: 0 };
    const REAL_PRODUCTS = [PRODUCT_A, PRODUCT_B];

    it("lists every active product (labeled 'Name · stock N') plus a trailing 'Otro…' option", async () => {
      const user = userEvent.setup();
      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={REAL_PRODUCTS} />);

      await user.click(screen.getByLabelText(/producto/i));

      // base-ui only mounts the listbox/options after the popup opens, so the
      // first lookup must be async (findByRole) — the rest are already in the
      // DOM by then. Mirrors `selectOption`'s `findByRole` gesture.
      expect(
        await screen.findByRole("option", { name: `${PRODUCT_A.name} · stock ${PRODUCT_A.currentQuantity}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: `${PRODUCT_B.name} · stock ${PRODUCT_B.currentQuantity}` }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /otro…/i })).toBeInTheDocument();
    });

    it("picking a real product hides the free-text description input and submits that product's id as productId", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={REAL_PRODUCTS} />);

      await selectOption(user, /cliente/i, CUSTOMER.name);
      await selectOption(user, /producto/i, `${PRODUCT_A.name} · stock ${PRODUCT_A.currentQuantity}`);

      // No free-text description input for a real-product line.
      expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument();

      await user.clear(screen.getByLabelText(/valor unitario/i));
      await user.type(screen.getByLabelText(/valor unitario/i), "500");
      await user.click(screen.getByRole("button", { name: /crear factura/i }));

      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.items).toEqual([
        { description: PRODUCT_A.name, quantity: 1, unitPrice: 50000, productId: PRODUCT_A.id },
      ]);
    });

    it("picking 'Otro…' reveals the free-text description input and submits null as productId", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "invoice-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={REAL_PRODUCTS} />);

      await selectOption(user, /cliente/i, CUSTOMER.name);
      await selectOption(user, /producto/i, /otro…/i);

      expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument();

      await fillFirstItem(user, "Consultoria por hora", "500");
      await user.click(screen.getByRole("button", { name: /crear factura/i }));

      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.items).toEqual([
        { description: "Consultoria por hora", quantity: 1, unitPrice: 50000, productId: null },
      ]);
    });

    it("switching from a real product back to 'Otro…' clears the derived description so the free-text input starts empty", async () => {
      const user = userEvent.setup();
      render(<InvoiceFormContent customers={[CUSTOMER]} invoiceTypes={INVOICE_TYPES} products={REAL_PRODUCTS} />);

      await selectOption(user, /producto/i, `${PRODUCT_A.name} · stock ${PRODUCT_A.currentQuantity}`);
      await selectOption(user, /producto/i, /otro…/i);

      expect(screen.getByLabelText(/descripción/i)).toHaveValue("");
    });

    it("edit mode: pre-selects the Select on the matching product when the item's productId is present in products", async () => {
      render(
        <InvoiceFormContent
          customers={[CUSTOMER]}
          invoiceTypes={INVOICE_TYPES}
          products={REAL_PRODUCTS}
          invoice={{
            id: "invoice-1",
            customerId: CUSTOMER.id,
            issueDate: "2026-06-01",
            dueDate: "2026-06-30",
            notes: "",
            items: [{ description: PRODUCT_A.name, quantity: 1, unitPrice: 100000, productId: PRODUCT_A.id }],
            paidAmount: 0,
          }}
        />,
      );

      expect(screen.getByLabelText(/producto/i)).toHaveTextContent(
        `${PRODUCT_A.name} · stock ${PRODUCT_A.currentQuantity}`,
      );
      expect(screen.queryByLabelText(/descripción/i)).not.toBeInTheDocument();
    });

    it("edit mode: falls back to 'Otro…' showing the stored description when productId is null or references a product absent from products (e.g. now inactive)", async () => {
      render(
        <InvoiceFormContent
          customers={[CUSTOMER]}
          invoiceTypes={INVOICE_TYPES}
          products={REAL_PRODUCTS}
          invoice={{
            id: "invoice-1",
            customerId: CUSTOMER.id,
            issueDate: "2026-06-01",
            dueDate: "2026-06-30",
            notes: "",
            items: [
              {
                description: "Producto descontinuado",
                quantity: 1,
                unitPrice: 100000,
                productId: "80000000-0000-4000-8000-000000000099",
              },
            ],
            paidAmount: 0,
          }}
        />,
      );

      expect(screen.getByLabelText(/producto/i)).toHaveTextContent(/otro…/i);
      expect(screen.getByLabelText(/descripción/i)).toHaveValue("Producto descontinuado");
    });
  });
});
