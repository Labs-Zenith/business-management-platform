import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { selectOption } from "@/components/ui/select-test-helpers";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));

import NuevaCardDialog from "./nueva-card-dialog-content";

const CUSTOMERS = [
  { id: "40000000-0000-4000-8000-000000000001", name: "Ana Gomez" },
  { id: "40000000-0000-4000-8000-000000000002", name: "Beto Ruiz" },
];

describe("NuevaCardDialog", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the trimmed title with the default stage ('nuevo') and null optional fields, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "new-id" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<NuevaCardDialog customers={CUSTOMERS} trigger={<button type="button">Nueva</button>} />);

    await user.click(screen.getByRole("button", { name: /^nueva$/i }));
    await user.type(await screen.findByLabelText(/título/i), "Oportunidad Acme");
    await user.click(screen.getByRole("button", { name: /crear card/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/ventas", expect.objectContaining({ method: "POST" }));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      title: "Oportunidad Acme",
      stage: "nuevo",
      customerId: null,
      amount: null,
      notes: null,
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("includes the selected customer, stage, amount, and notes when filled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "new-id" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<NuevaCardDialog customers={CUSTOMERS} trigger={<button type="button">Nueva</button>} />);

    await user.click(screen.getByRole("button", { name: /^nueva$/i }));
    await user.type(await screen.findByLabelText(/título/i), "Oportunidad Beto");
    await selectOption(user, /estado/i, "Interesado");
    await selectOption(user, /cliente/i, "Beto Ruiz");
    await user.type(screen.getByLabelText(/monto/i), "150000");
    await user.type(screen.getByLabelText(/notas/i), "Llamar la próxima semana");
    await user.click(screen.getByRole("button", { name: /crear card/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      title: "Oportunidad Beto",
      stage: "interesado",
      customerId: "40000000-0000-4000-8000-000000000002",
      amount: 15_000_000,
      notes: "Llamar la próxima semana",
    });
  });

  it("keeps the submit button disabled until a title is entered", async () => {
    const user = userEvent.setup();
    render(<NuevaCardDialog customers={CUSTOMERS} trigger={<button type="button">Nueva</button>} />);

    await user.click(screen.getByRole("button", { name: /^nueva$/i }));
    await screen.findByLabelText(/título/i);

    expect(screen.getByRole("button", { name: /crear card/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/título/i), "X");
    expect(screen.getByRole("button", { name: /crear card/i })).not.toBeDisabled();
  });

  it("shows the server error message, keeps the dialog open, and does not refresh when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Título inválido." } }) }),
    );

    render(<NuevaCardDialog customers={CUSTOMERS} trigger={<button type="button">Nueva</button>} />);

    await user.click(screen.getByRole("button", { name: /^nueva$/i }));
    await user.type(await screen.findByLabelText(/título/i), "Oportunidad Acme");
    await user.click(screen.getByRole("button", { name: /crear card/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Título inválido.");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("resets the form back to blank values if the dialog is closed and reopened without submitting", async () => {
    const user = userEvent.setup();
    render(<NuevaCardDialog customers={CUSTOMERS} trigger={<button type="button">Nueva</button>} />);

    await user.click(screen.getByRole("button", { name: /^nueva$/i }));
    await user.type(await screen.findByLabelText(/título/i), "Borrador sin guardar");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^nueva$/i }));
    expect(await screen.findByLabelText(/título/i)).toHaveValue("");
  });
});
