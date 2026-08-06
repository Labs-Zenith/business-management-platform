import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

/**
 * The form itself is covered by `catalog-product-form-content.test.tsx`. What
 * matters here is only what the DIALOG adds: loading the product on open,
 * closing and refreshing on save, and not stranding a stale product between
 * openings.
 */
vi.mock("./catalog-product-form-content", () => ({
  default: ({
    product,
    onSaved,
  }: {
    product?: { id: string; name: string };
    onSaved: (id: string) => void;
  }) => (
    <div>
      <span data-testid="loaded-name">{product?.name ?? "sin producto"}</span>
      <button type="button" onClick={() => onSaved("prod-1")}>
        Guardar
      </button>
    </div>
  ),
}));

import CatalogProductFormDialog from "./catalog-product-form-dialog-content";

const PRODUCT = { id: "prod-1", name: "Hifu facial" };

describe("CatalogProductFormDialog", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders the form straight away in create mode, without fetching anything", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CatalogProductFormDialog
        mode="create"
        categories={[]}
        trigger={<button type="button">Nuevo producto</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));

    expect(await screen.findByTestId("loaded-name")).toHaveTextContent("sin producto");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the full product on open in edit mode — the list row only carries a summary", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: PRODUCT }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CatalogProductFormDialog
        mode="edit"
        productId="prod-1"
        categories={[]}
        trigger={<button type="button">Editar</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/catalog-products/prod-1");
    expect(await screen.findByTestId("loaded-name")).toHaveTextContent("Hifu facial");
  });

  it("shows an error instead of an empty form when the product cannot be loaded", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    render(
      <CatalogProductFormDialog
        mode="edit"
        productId="prod-1"
        categories={[]}
        trigger={<button type="button">Editar</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("loaded-name")).not.toBeInTheDocument();
  });

  it("closes and refreshes in place after a save, without navigating", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: PRODUCT }) }));

    render(
      <CatalogProductFormDialog
        mode="edit"
        productId="prod-1"
        categories={[]}
        trigger={<button type="button">Editar</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(await screen.findByRole("button", { name: "Guardar" }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("loaded-name")).not.toBeInTheDocument();
  });

  it("navigates to redirectTo when given one — the detail page keeps you on the product", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: PRODUCT }) }));

    render(
      <CatalogProductFormDialog
        mode="edit"
        productId="prod-1"
        categories={[]}
        redirectTo="/catalogo/prod-1"
        trigger={<button type="button">Editar</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(await screen.findByRole("button", { name: "Guardar" }));

    expect(pushMock).toHaveBeenCalledWith("/catalogo/prod-1");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("re-reads the product on every open, so a reopened dialog never shows stale values", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: PRODUCT }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: "prod-1", name: "Hifu abdomen" } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CatalogProductFormDialog
        mode="edit"
        productId="prod-1"
        categories={[]}
        trigger={<button type="button">Editar</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByTestId("loaded-name")).toHaveTextContent("Hifu facial");

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByTestId("loaded-name")).toHaveTextContent("Hifu abdomen");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
