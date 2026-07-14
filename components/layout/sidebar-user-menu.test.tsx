import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("renders an avatar + email trigger, with the email as its accessible name", () => {
    render(<SidebarUserMenu email={EMAIL} />);

    const trigger = screen.getByRole("button", { name: EMAIL });
    expect(trigger).toBeInTheDocument();
    expect(within(trigger).getByText("D")).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("hides the email label (avatar-only) when collapsed, but keeps it as the accessible name", () => {
    render(<SidebarUserMenu email={EMAIL} collapsed />);

    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: EMAIL })).toBeInTheDocument();
  });

  it("opens to reveal the session email and a Cerrar sesion action", async () => {
    const user = userEvent.setup();
    render(<SidebarUserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));

    expect(await screen.findByRole("menuitem", { name: /cerrar sesion/i })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesion/i }));

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

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesion/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a generic inline error on a network failure without crashing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<SidebarUserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesion/i }));

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

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesion/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: EMAIL })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
