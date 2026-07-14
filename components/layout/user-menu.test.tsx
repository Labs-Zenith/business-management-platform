import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import UserMenu from "./user-menu";

const EMAIL = "demo@negociodemo.test";

/**
 * Fase 5 Lane 1: replaces the previous static session `Avatar` + separate
 * `LogoutButton` — the avatar itself is now the dropdown trigger, and
 * "Cerrar sesion" (mirroring `logout-button.test.tsx`'s fetch/router
 * mocking pattern, since this is the same "POST an auth endpoint, then
 * redirect" shape) lives inside the opened menu alongside the session
 * email label.
 */
describe("UserMenu", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an avatar trigger showing the email initial, with the email as its accessible name", () => {
    render(<UserMenu email={EMAIL} />);

    const trigger = screen.getByRole("button", { name: EMAIL });
    expect(trigger).toBeInTheDocument();
    expect(within(trigger).getByText("D")).toBeInTheDocument();
  });

  it("opens to reveal the session email and a Cerrar sesion action", async () => {
    const user = userEvent.setup();
    render(<UserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));

    expect(await screen.findByText(EMAIL)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /cerrar sesion/i })).toBeInTheDocument();
  });

  it("POSTs to /api/auth/logout and redirects to /login on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UserMenu email={EMAIL} />);

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

    render(<UserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesion/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a generic inline error on a network failure without crashing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<UserMenu email={EMAIL} />);

    await user.click(screen.getByRole("button", { name: EMAIL }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesion/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
