import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { selectOption } from "@/components/ui/select-test-helpers";
import type { PipelineCard } from "@/lib/services/ports";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import CardDetailDialogContent from "./card-detail-dialog-content";

const CARD: PipelineCard = {
  id: "80000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  customerId: "40000000-0000-4000-8000-000000000001",
  title: "Oportunidad Acme",
  stage: "nuevo",
  amount: 500_000_00,
  notes: "Interesado en el plan anual",
  position: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
};

const CUSTOMERS = [
  { id: "40000000-0000-4000-8000-000000000001", name: "Ana Gomez" },
  { id: "40000000-0000-4000-8000-000000000002", name: "Beto Ruiz" },
];

describe("CardDetailDialogContent", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pre-fills the form with the existing card's data", () => {
    render(
      <CardDetailDialogContent open onOpenChange={vi.fn()} card={CARD} customers={CUSTOMERS} />,
    );

    expect(screen.getByDisplayValue("Oportunidad Acme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Interesado en el plan anual")).toBeInTheDocument();
    expect(screen.getByLabelText(/estado/i)).toHaveTextContent("Nuevo");
    expect(screen.getByLabelText(/cliente/i)).toHaveTextContent("Ana Gomez");
    expect(screen.getByLabelText(/monto/i)).toHaveValue("500.000");
  });

  it("shows Creado/Actualizado timestamps", () => {
    render(
      <CardDetailDialogContent open onOpenChange={vi.fn()} card={CARD} customers={CUSTOMERS} />,
    );

    expect(screen.getByText(/creado:/i)).toBeInTheDocument();
    expect(screen.getByText(/actualizado:/i)).toBeInTheDocument();
  });

  it("PATCHes /api/ventas/{id} with the edited title, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: CARD }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardDetailDialogContent open onOpenChange={onOpenChange} card={CARD} customers={CUSTOMERS} />,
    );

    const titleInput = screen.getByDisplayValue("Oportunidad Acme");
    await user.clear(titleInput);
    await user.type(titleInput, "Oportunidad Acme (renovación)");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/ventas/${CARD.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      title: "Oportunidad Acme (renovación)",
      stage: "nuevo",
      customerId: CARD.customerId,
      amount: CARD.amount,
      notes: CARD.notes,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("sends null customerId and null amount when both are cleared", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: CARD }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardDetailDialogContent open onOpenChange={vi.fn()} card={CARD} customers={CUSTOMERS} />,
    );

    await selectOption(user, /cliente/i, "Sin cliente");
    await user.clear(screen.getByLabelText(/monto/i));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.customerId).toBeNull();
    expect(body.amount).toBeNull();
  });

  it("changes the stage via the Select and submits the new value", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: CARD }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardDetailDialogContent open onOpenChange={vi.fn()} card={CARD} customers={CUSTOMERS} />,
    );

    await selectOption(user, /estado/i, "Cerrado ganado");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body).stage).toBe("ganado");
  });

  it("shows the server error message and does not close/refresh when the PATCH fails", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Título inválido." } }),
      }),
    );

    render(
      <CardDetailDialogContent open onOpenChange={onOpenChange} card={CARD} customers={CUSTOMERS} />,
    );

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Título inválido.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("DELETEs /api/ventas/{id} via the confirm dialog, closes, and refreshes on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CardDetailDialogContent open onOpenChange={onOpenChange} card={CARD} customers={CUSTOMERS} />,
    );

    await user.click(screen.getByRole("button", { name: /^eliminar$/i }));
    const confirmButtons = await screen.findAllByRole("button", { name: /^eliminar$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/ventas/${CARD.id}`, expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows a delete error and keeps the dialog open when the DELETE fails", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "No se pudo eliminar." } }) }),
    );

    render(
      <CardDetailDialogContent open onOpenChange={onOpenChange} card={CARD} customers={CUSTOMERS} />,
    );

    await user.click(screen.getByRole("button", { name: /^eliminar$/i }));
    const confirmButtons = await screen.findAllByRole("button", { name: /^eliminar$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    // `ConfirmDialog` (`components/ui/confirm-dialog.tsx`) never auto-closes
    // itself after `onConfirm` — same established behavior as every other
    // `ConfirmDialog` consumer in the app (e.g. `profile-picker.tsx`). On a
    // failed delete the nested confirm dialog stays open on top, so the
    // parent's error text is genuinely in the DOM but marked `aria-hidden`
    // (inert) behind it — `{ hidden: true }` mirrors `nomina/page.test.tsx`'s
    // established convention for asserting on content behind an inert layer.
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo eliminar.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
