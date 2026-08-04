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

import DeleteCustomerButton from "./delete-customer-button";

const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";
const CUSTOMER_NAME = "Ana Gómez";
const CONFLICT_MESSAGE =
  "No se puede eliminar este cliente porque tiene 3 facturas asociadas. Desactívalo en su lugar.";

function renderButton(redirectTo?: string, customerActive = true) {
  return render(
    <DeleteCustomerButton
      customerId={CUSTOMER_ID}
      customerName={CUSTOMER_NAME}
      customerActive={customerActive}
      redirectTo={redirectTo}
    />
  );
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: `Eliminar ${CUSTOMER_NAME}` }));
  await user.click(await screen.findByRole("button", { name: "Eliminar", hidden: false }));
}

describe("DeleteCustomerButton", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("asks for confirmation before deleting — clicking the trigger alone issues no request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderButton();

    await user.click(screen.getByRole("button", { name: `Eliminar ${CUSTOMER_NAME}` }));

    expect(await screen.findByText("¿Eliminar este cliente?")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns up front that a customer with financial history cannot be deleted", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: `Eliminar ${CUSTOMER_NAME}` }));

    expect(
      await screen.findByText(/no se puede eliminar; en ese caso podrás desactivarlo/i)
    ).toBeInTheDocument();
  });

  it("DELETEs and refreshes in place when no redirectTo is given (list page)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderButton();

    await confirmDelete(user);

    // `content-type` is required by `checkOrigin` even with no body.
    expect(fetchMock).toHaveBeenCalledWith(`/api/customers/${CUSTOMER_ID}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigates to redirectTo instead of refreshing when given (detail page)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) }));
    renderButton("/customers");

    await confirmDelete(user);

    // Staying on the detail page of a deleted customer would 404 on refresh.
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/customers"));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows the server's CONFLICT message inline and keeps the dialog open, without navigating", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "CONFLICT", message: CONFLICT_MESSAGE } }),
      })
    );
    renderButton("/customers");

    await confirmDelete(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(CONFLICT_MESSAGE);
    expect(screen.getByText("¿Eliminar este cliente?")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the network request throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderButton();

    await confirmDelete(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo eliminar el cliente. Intenta de nuevo."
    );
  });

  it("renders an icon-only trigger on the list and a labelled one on the detail page", async () => {
    const { unmount } = renderButton();
    expect(screen.getByRole("button", { name: `Eliminar ${CUSTOMER_NAME}` })).not.toHaveTextContent("Eliminar");
    unmount();

    renderButton("/customers");
    expect(screen.getByRole("button", { name: `Eliminar ${CUSTOMER_NAME}` })).toHaveTextContent("Eliminar");
  });
});

/** Same recovery path as the product button — see its test file's note. */
describe("DeleteCustomerButton — Desactivar recovery", () => {
  const CONFLICT_BODY = { error: { code: "CONFLICT", message: CONFLICT_MESSAGE } };

  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("offers Desactivar after a CONFLICT", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => CONFLICT_BODY }));
    renderButton();

    await confirmDelete(user);

    expect(await screen.findByRole("button", { name: "Desactivar" })).toBeInTheDocument();
  });

  it("PATCHes isActive:false and refreshes in place, even on the detail page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => CONFLICT_BODY })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { isActive: false } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderButton("/customers");

    await confirmDelete(user);
    await user.click(await screen.findByRole("button", { name: "Desactivar" }));

    expect(fetchMock).toHaveBeenLastCalledWith(`/api/customers/${CUSTOMER_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    // Deactivating leaves the customer in place, so the detail page stays
    // valid — no navigation, unlike a successful delete.
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does NOT offer Desactivar when the customer is already inactive", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => CONFLICT_BODY }));
    renderButton(undefined, false);

    await confirmDelete(user);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });
});
