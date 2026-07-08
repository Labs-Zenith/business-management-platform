import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits credentials to /api/auth/login and redirects to the dashboard on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { session: { userId: "u1", businessId: "b1", email: "demo@negociodemo.test" } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "demo@negociodemo.test");
    await user.type(screen.getByLabelText(/contrase/i), "demo1234");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "demo@negociodemo.test", password: "demo1234" }),
      })
    );
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows a generic error message and does not redirect when credentials are wrong", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { code: "UNAUTHENTICATED", message: "Invalid email or password." },
        }),
      })
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "demo@negociodemo.test");
    await user.type(screen.getByLabelText(/contrase/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
