import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import SidebarUserMenu from "./sidebar-user-menu";

const EMAIL = "demo@negociodemo.test";

/**
 * Fase 5.1 Lane B: the bottom-of-sidebar/drawer user row, direct successor
 * of the deleted topbar `user-menu.tsx` — same fetch/router mocking
 * pattern ("POST an auth endpoint, then redirect").
 *
 * Fase 5.2 F3: in expanded mode `[avatar + email]` is now a plain
 * non-interactive row and the "⋯" button (`aria-label="Opciones de
 * cuenta"`) on the right is the real `DropdownMenuTrigger`. In `collapsed`
 * (rail) mode there's no separate `⋯` button — the avatar itself remains
 * the trigger, still named by the session email.
 *
 * Deliberately has NO `onNavigate`/close-the-drawer prop: this component
 * used to accept one and fire it synchronously at the start of
 * `handleLogout`, which — in the mobile drawer — unmounted the component
 * (tearing down its pending `fetch`) before a failed logout could ever
 * render its error, silently swallowing the failure. See the
 * "does not rely on any close callback" test below.
 */
describe("SidebarUserMenu", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the whole avatar + username row AS the 'Opciones de cuenta' dropdown trigger", () => {
    render(<SidebarUserMenu email={EMAIL} />);

    expect(screen.getByText("D")).toBeInTheDocument();

    // The whole row is now a single DropdownMenu trigger button; the avatar +
    // username live inside it (clicking anywhere on the row opens the menu).
    const trigger = screen.getByRole("button", { name: "Opciones de cuenta" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent(EMAIL);
  });

  it("hides the email label AND the ⋯ trigger when collapsed, making the avatar itself the trigger", () => {
    render(<SidebarUserMenu email={EMAIL} collapsed />);

    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opciones de cuenta" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: EMAIL })).toBeInTheDocument();
  });

  it("opens to reveal the session email and a Cerrar sesión action", async () => {
    const user = userEvent.setup();
    render(<SidebarUserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: "Opciones de cuenta" }));

    expect(await screen.findByRole("menuitem", { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(screen.getAllByText(EMAIL).length).toBeGreaterThan(0);
  });

  it("POSTs to /api/auth/logout and redirects to /login on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SidebarUserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: "Opciones de cuenta" }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesión/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
    expect(pushMock).toHaveBeenCalledWith("/login");
  });

  it("shows a generic inline error and does not redirect when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
      })
    );

    render(<SidebarUserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: "Opciones de cuenta" }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesión/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a generic inline error on a network failure without crashing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<SidebarUserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: "Opciones de cuenta" }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesión/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("renders the error and stays mounted on a failed logout, with no close callback to rely on (mobile-drawer regression guard)", async () => {
    // Regression guard for a bug where this component used to accept an
    // `onNavigate` callback fired synchronously at the start of
    // `handleLogout` — in the mobile drawer that unmounted the component
    // before a failed `fetch` could render its error, silently swallowing
    // it. This component now takes no such prop at all, so a failed logout
    // has nothing tearing it down: the error must render and the trigger
    // must still be present.
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
      })
    );

    render(<SidebarUserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: "Opciones de cuenta" }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesión/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opciones de cuenta" })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
