import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SavedAccount } from "@/lib/services/ports";
import ProfilePicker from "./profile-picker";

const ACCOUNTS: SavedAccount[] = [
  { userId: "u1", email: "demo@negociodemo.test", label: "Demo", active: true },
  { userId: "u2", email: "otra@negociodemo.test", label: "Otra cuenta", active: false },
];

const SINGLE_ACCOUNT: SavedAccount[] = [
  { userId: "u1", email: "demo@negociodemo.test", label: "Demo", active: true },
];

const assignMock = vi.fn();

describe("ProfilePicker", () => {
  beforeEach(() => {
    assignMock.mockReset();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the selected account's userId to /api/auth/switch-account and navigates on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { session: {} } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePicker accounts={ACCOUNTS} />);

    await user.click(screen.getByText("Otra cuenta"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch-account",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "u2" }),
      })
    );
    expect(assignMock).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates to a sanitized `next` path on success when provided", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { session: {} } }) })
    );

    render(<ProfilePicker accounts={ACCOUNTS} next="/invoices" />);

    await user.click(screen.getByText("Demo"));

    expect(assignMock).toHaveBeenCalledWith("/invoices");
  });

  it("shows an alert and does not navigate when the switch fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "nope" } }),
      })
    );

    render(<ProfilePicker accounts={ACCOUNTS} />);

    await user.click(screen.getByText("Demo"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo entrar a ese perfil/i
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('"Usar otra cuenta" links to /login?add=1 when below the saved-accounts cap', () => {
    render(<ProfilePicker accounts={SINGLE_ACCOUNT} />);

    expect(screen.getByRole("link", { name: /usar otra cuenta/i })).toHaveAttribute(
      "href",
      "/login?add=1"
    );
  });

  it('"Usar otra cuenta" preserves a `next` path when present', () => {
    render(<ProfilePicker accounts={SINGLE_ACCOUNT} next="/invoices" />);

    expect(screen.getByRole("link", { name: /usar otra cuenta/i })).toHaveAttribute(
      "href",
      `/login?add=1&next=${encodeURIComponent("/invoices")}`
    );
  });

  it('hides "Usar otra cuenta" and shows a max-accounts hint once MAX_SAVED_ACCOUNTS is reached', () => {
    render(<ProfilePicker accounts={ACCOUNTS} />);

    expect(screen.queryByRole("link", { name: /usar otra cuenta/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/máximo 2 cuentas guardadas\. elimina una para agregar otra\./i)
    ).toBeInTheDocument();
  });

  it("the trash icon opens the confirm modal without triggering account selection", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePicker accounts={ACCOUNTS} />);

    await user.click(screen.getByRole("button", { name: /eliminar perfil de otra cuenta/i }));

    expect(await screen.findByText("¿Eliminar este perfil guardado?")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirming removal POSTs the userId to /api/auth/remove-account and reloads", async () => {
    const user = userEvent.setup();
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignMock, reload: reloadMock });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePicker accounts={ACCOUNTS} />);

    await user.click(screen.getByRole("button", { name: /eliminar perfil de otra cuenta/i }));
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/remove-account",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "u2" }),
      })
    );
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("selecting the row still POSTs to /api/auth/switch-account (trash does not interfere)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { session: {} } }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePicker accounts={ACCOUNTS} />);

    await user.click(screen.getByText("Otra cuenta"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch-account",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "u2" }),
      })
    );
  });
});
