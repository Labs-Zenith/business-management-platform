import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import LogoutButton from "./logout-button";

/**
 * Mirrors `app/(auth)/login/page.test.tsx`'s fetch/router mocking pattern
 * (PR2), since this is the same "POST an auth endpoint, then redirect"
 * shape in reverse.
 */
describe("LogoutButton", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/auth/logout and redirects to /login on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { success: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: /cerrar sesion/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
    expect(pushMock).toHaveBeenCalledWith("/login");
  });

  it("shows a generic error message and does not redirect when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
      })
    );

    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: /cerrar sesion/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
