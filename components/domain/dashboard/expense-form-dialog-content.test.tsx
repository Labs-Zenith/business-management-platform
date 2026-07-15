import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { clearDay, displayDate, pickDay } from "@/components/ui/date-picker-test-helpers";
import { selectOption } from "@/components/ui/select-test-helpers";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import ExpenseFormDialog from "./expense-form-dialog-content";

const CATEGORIES = [
  { id: "c1000000-0000-4000-8000-000000000001", code: "nomina", label: "Nómina" },
  { id: "c1000000-0000-4000-8000-000000000002", code: "otro", label: "Otro" },
];

describe("ExpenseFormDialog", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("POSTs the amount converted to integer cents to /api/expenses, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "expense-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/expenses", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.amount).toBe(50000);
    expect(body.category).toBe("otro");
    // "otro" is the default category; its matching catalog id must ALSO be
    // sent, resolved from the `categories` prop by code — see
    // `expense-form-dialog-content.tsx`'s `categoryId` lookup at submit time.
    expect(body.categoryId).toBe(CATEGORIES[1]!.id);
    expect(body.description).toBe("Papeleria");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("submits the categoryId matching a newly picked category from the Select (sourced from the catalog)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "expense-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await selectOption(user, /categoria/i, "Nómina");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.category).toBe("nomina");
    expect(body.categoryId).toBe(CATEGORIES[0]!.id);
  });

  it("shows a live inline error and disables the submit button when amount is not greater than 0 (no request sent)", async () => {
    // The submit button is disabled while the form is invalid (live
    // `useZodForm` validation, `lib/schemas/expense.ts`), so a click on
    // "Guardar" is a no-op here — the field is blurred directly instead to
    // surface the live inline error, matching how a real user would discover
    // it while tabbing through the form.
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    // amount left at its default ("") — invalid, must be > 0
    await user.click(screen.getByLabelText(/monto/i));
    await user.tab();

    expect(await screen.findByText(/demasiado peque/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a live inline error and disables the submit button when the description is missing (no request sent)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.clear(await screen.findByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByLabelText(/descripcion/i));
    await user.tab();

    expect(await screen.findByText(/demasiado peque/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the live inline error and enables the submit button once a valid amount is entered", async () => {
    const user = userEvent.setup();

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.click(screen.getByLabelText(/monto/i));
    await user.tab();

    expect(await screen.findByText(/demasiado peque/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/monto/i), "500");

    await waitFor(() => expect(screen.queryByText(/demasiado peque/i)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /guardar/i })).not.toBeDisabled();
  });

  it("shows the server error message, keeps the dialog open, and preserves entered values when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Monto invalido." } }),
      }),
    );

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Monto invalido.");
    expect(refreshMock).not.toHaveBeenCalled();
    // The dialog must remain open and usable — not silently closed on error.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/descripcion/i)).toHaveValue("Papeleria");
    expect(screen.getByLabelText(/monto/i)).toHaveValue("500");
  });

  it("shows the generic error message and keeps the dialog open when fetch throws (network failure)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo registrar el egreso. Verifica los datos e intenta de nuevo.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the generic error message and keeps the dialog open when the error response body is not valid JSON", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      }),
    );

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo registrar el egreso. Verifica los datos e intenta de nuevo.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
    "converts $typed pesos (comma decimal) to $expectedCents cents through the MoneyInput mask",
    async ({ typed, expectedCents }) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "expense-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

      await user.click(screen.getByRole("button", { name: /crear gasto/i }));
      await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
      await user.clear(screen.getByLabelText(/monto/i));
      await user.type(screen.getByLabelText(/monto/i), typed);
      await user.click(screen.getByRole("button", { name: /guardar/i }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body);
      expect(body.amount).toBe(expectedCents);
    },
  );

  it("defaults the date trigger to LOCAL today's date, not UTC's, even when local time has rolled into the next UTC day", async () => {
    // Pin a single fixed instant: 2026-07-06T23:30:00-05:00, i.e. 2026-07-07T04:30:00Z.
    // For a UTC-5 zone (Colombia, no DST) this is evening-local but already the NEXT
    // day in UTC — exactly the case where `.toISOString().slice(0, 10)` (UTC-based)
    // would silently disagree with the user's local calendar date.
    //
    // The expected value below is derived from the SAME pinned instant using local
    // Date getters (not a hardcoded "2026-07-06" literal), so this assertion is
    // correct regardless of the timezone the test process itself happens to run in.
    //
    // Uses `vi.setSystemTime` WITHOUT `vi.useFakeTimers()` so `Date` is mocked while
    // real timers (animations, userEvent internals) keep working normally.
    const pinnedInstant = new Date("2026-07-07T04:30:00Z");
    vi.setSystemTime(pinnedInstant);

    const expectedLocalDate = `${pinnedInstant.getFullYear()}-${String(pinnedInstant.getMonth() + 1).padStart(2, "0")}-${String(pinnedInstant.getDate()).padStart(2, "0")}`;
    const expectedUtcDate = pinnedInstant.toISOString().slice(0, 10);

    const user = userEvent.setup();
    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    // The native `type="date"` input is gone — the trigger is now a `<button>`
    // labeled via `<Label htmlFor>`, displaying the `DatePicker`'s "d MMM yyyy"
    // formatted text instead of an ISO `value`.
    const trigger = await screen.findByLabelText(/fecha/i);

    expect(trigger).toHaveTextContent(displayDate(expectedLocalDate));
    if (expectedLocalDate !== expectedUtcDate) {
      expect(trigger).not.toHaveTextContent(displayDate(expectedUtcDate));
    }
  });

  it("allows picking a new expenseDate via the Calendar and submits it as the ISO payload value", async () => {
    const user = userEvent.setup();
    // Pin "today" so the Calendar opens on a known month without navigation.
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "expense-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");

    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha/i, dayLabel);

    expect(screen.getByLabelText(/fecha/i)).toHaveTextContent("20 jul 2026");

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.expenseDate).toBe("2026-07-20");
  });

  it("blocks submission client-side when expenseDate is cleared via the DatePicker's toggle-to-clear gesture (no request sent)", async () => {
    // `expenseDate` is required (`lib/schemas/expense.ts`'s `dateSchema`,
    // `z.string().trim().min(1, ...)`) and defaults to today's date, so a
    // fresh dialog never starts empty — the only way to reach the
    // empty/invalid state is via `DatePicker`'s real clear gesture
    // (re-clicking the already-selected day), which this test exercises
    // end-to-end. The `DatePicker`'s `onChange` marks the field `touched`
    // immediately (it has no native blur to hook into), so the live inline
    // error appears right after the clear gesture — no submit click needed.
    const user = userEvent.setup();
    vi.setSystemTime(new Date(2026, 6, 7));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");

    // Pick a non-today day first so the clear-gesture lookup (`clearDay`)
    // never collides with react-day-picker's "Hoy, " accessible-name prefix
    // (the default `expenseDate` value is today, which would otherwise be
    // selected AND today simultaneously).
    const targetDate = new Date(2026, 6, 20);
    const dayLabel = format(targetDate, "PPPP", { locale: es });
    await pickDay(user, /fecha/i, dayLabel);
    await clearDay(user, /fecha/i, dayLabel);

    expect(screen.getByLabelText(/fecha/i)).toHaveTextContent(/seleccionar fecha/i);
    expect(await screen.findByText(/demasiado peque/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits the notes field from the payload when it is left whitespace-only", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "expense-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.type(screen.getByLabelText(/nota/i), "   ");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("notes");
  });

  it("trims and includes real notes content in the payload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "expense-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog categories={CATEGORIES} trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.type(screen.getByLabelText(/nota/i), "  Pagado en efectivo  ");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.notes).toBe("Pagado en efectivo");
  });
});
