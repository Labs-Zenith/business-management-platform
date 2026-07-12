import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import ExpenseFormDialog from "./expense-form-dialog-content";

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

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

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
    expect(body.description).toBe("Papeleria");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("blocks submission client-side and shows a validation error when amount is not greater than 0 (no request sent)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    // amount left at its default (0) — invalid, must be > 0
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/el monto debe ser mayor a 0/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks submission client-side when the description is missing (no request sent)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.clear(await screen.findByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText(/descripcion requerida/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
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

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

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
    expect(screen.getByLabelText(/monto/i)).toHaveValue(500);
  });

  it("shows the generic error message and keeps the dialog open when fetch throws (network failure)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo crear el gasto. Verifica los datos e intenta de nuevo.",
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

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    await user.type(await screen.findByLabelText(/descripcion/i), "Papeleria");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.type(screen.getByLabelText(/monto/i), "500");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo crear el gasto. Verifica los datos e intenta de nuevo.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each([
    { typed: "1.005", expectedCents: 101 },
    { typed: "8.575", expectedCents: 858 },
    { typed: "5.015", expectedCents: 502 },
  ])(
    "converts $typed pesos to $expectedCents cents without IEEE-754 rounding-down artifacts",
    async ({ typed, expectedCents }) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "expense-1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

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

  it("defaults the date field to LOCAL today's date, not UTC's, even when local time has rolled into the next UTC day", async () => {
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
    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

    await user.click(screen.getByRole("button", { name: /crear gasto/i }));
    const dateInput = await screen.findByLabelText(/fecha/i);

    expect(dateInput).toHaveValue(expectedLocalDate);
    if (expectedLocalDate !== expectedUtcDate) {
      expect(dateInput).not.toHaveValue(expectedUtcDate);
    }
  });

  it("omits the notes field from the payload when it is left whitespace-only", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "expense-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

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

    render(<ExpenseFormDialog trigger={<button type="button">Crear gasto</button>} />);

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
