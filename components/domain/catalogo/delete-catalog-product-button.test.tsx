import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock, pushMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import DeleteCatalogProductButton from "./delete-catalog-product-button";

const PRODUCT_ID = "b0000000-0000-4000-8000-000000000001";
const PRODUCT_NAME = "Aviso en acrílico";

function renderButton(productActive = true) {
  return render(
    <DeleteCatalogProductButton productId={PRODUCT_ID} productName={PRODUCT_NAME} productActive={productActive} />
  );
}

/** Opens the confirm dialog and clicks through to the destructive action. */
async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: `Eliminar ${PRODUCT_NAME}` }));
  await user.click(await screen.findByRole("button", { name: "Eliminar" }));
}

describe("DeleteCatalogProductButton", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("names the product in the trigger's accessible label, so screen readers can tell rows apart", () => {
    renderButton();

    expect(screen.getByRole("button", { name: `Eliminar ${PRODUCT_NAME}` })).toBeInTheDocument();
  });

  it("asks for confirmation before deleting — clicking the trigger alone issues no request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderButton();

    await user.click(screen.getByRole("button", { name: `Eliminar ${PRODUCT_NAME}` }));

    expect(await screen.findByText("¿Eliminar este producto?")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns up front that an invoiced product cannot be deleted, only deactivated", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: `Eliminar ${PRODUCT_NAME}` }));

    expect(await screen.findByText(/no se puede eliminar; en ese caso podrás desactivarlo/i)).toBeInTheDocument();
  });

  it("DELETEs the product and refreshes the list on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderButton();

    await confirmDelete(user);

    // The `content-type` header is NOT optional: `checkOrigin` rejects any
    // mutation without it, so a bare `{method:"DELETE"}` 400s every time.
    expect(fetchMock).toHaveBeenCalledWith(`/api/catalog-products/${PRODUCT_ID}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    // A list-page delete never navigates.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("closes the dialog on success", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) }));
    renderButton();

    await confirmDelete(user);

    await waitFor(() => {
      expect(screen.queryByText("¿Eliminar este producto?")).not.toBeInTheDocument();
    });
  });

  it("surfaces the server's message inline and keeps the dialog open on failure, without refreshing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "FORBIDDEN", message: "No tienes permiso para eliminar." } }),
      })
    );
    renderButton();

    await confirmDelete(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No tienes permiso para eliminar.");
    expect(screen.getByText("¿Eliminar este producto?")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the error body is unparseable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("not json");
        },
      })
    );
    renderButton();

    await confirmDelete(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo eliminar el producto. Intenta de nuevo."
    );
  });

  it("shows the generic message when the network request itself throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderButton();

    await confirmDelete(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo eliminar el producto. Intenta de nuevo."
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("clears a stale error when the dialog is reopened", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Falló." } }),
      })
    );
    renderButton();

    await confirmDelete(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Falló.");

    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: `Eliminar ${PRODUCT_NAME}` }));

    await screen.findByText("¿Eliminar este producto?");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/**
 * The recovery path: a refused delete must not be a dead end. Only a
 * `CONFLICT` earns the offer — a 403 or a network failure is a different
 * problem, and offering "Desactivar" there would be misleading.
 */
describe("DeleteCatalogProductButton — Desactivar recovery", () => {
  const CONFLICT_BODY = {
    error: {
      code: "CONFLICT",
      message: "No se puede eliminar este producto porque tiene 2 facturas asociadas. Desactívalo en su lugar.",
    },
  };

  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("offers Desactivar (replacing Eliminar) after a CONFLICT", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => CONFLICT_BODY }));
    renderButton();

    await confirmDelete(user);

    expect(await screen.findByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    // Retrying the delete verbatim could only fail again, so it steps aside.
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });

  it("PATCHes active:false and refreshes when Desactivar is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => CONFLICT_BODY })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { active: false } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderButton();

    await confirmDelete(user);
    await user.click(await screen.findByRole("button", { name: "Desactivar" }));

    expect(fetchMock).toHaveBeenLastCalledWith(`/api/catalog-products/${PRODUCT_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByText("¿Eliminar este producto?")).not.toBeInTheDocument();
    });
  });

  it("does NOT offer Desactivar when the product is already inactive — it would be a no-op", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => CONFLICT_BODY }));
    renderButton(false);

    await confirmDelete(user);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });

  it("does NOT offer Desactivar for a non-CONFLICT failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "FORBIDDEN", message: "Sin permiso." } }),
      })
    );
    renderButton();

    await confirmDelete(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sin permiso.");
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });

  it("surfaces a failure of the deactivation itself, keeping the dialog open", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, json: async () => CONFLICT_BODY })
        .mockResolvedValueOnce({ ok: false, json: async () => null })
    );
    renderButton();

    await confirmDelete(user);
    await user.click(await screen.findByRole("button", { name: "Desactivar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo desactivar el producto. Intenta de nuevo.");
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
