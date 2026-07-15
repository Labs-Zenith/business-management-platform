import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
let mockNextParam = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(mockNextParam ? `next=${mockNextParam}` : ""),
}));

import LoginPage from "./page";

async function submitValidLogin() {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { session: {} } }) })
  );
  render(<LoginPage />);
  await user.type(screen.getByLabelText(/correo/i), "demo@negociodemo.test");
  await user.type(screen.getByLabelText(/contrase/i, { selector: "input" }), "demo1234");
  await user.click(screen.getByRole("button", { name: /ingresar/i }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockNextParam = "";
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

    await user.type(screen.getByLabelText(/correo/i), "demo@negociodemo.test");
    await user.type(screen.getByLabelText(/contrase/i, { selector: "input" }), "demo1234");
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

    await user.type(screen.getByLabelText(/correo/i), "demo@negociodemo.test");
    await user.type(screen.getByLabelText(/contrase/i, { selector: "input" }), "wrong-password");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("honors a same-origin ?next= path on success (Agregar cuenta return-to)", async () => {
    mockNextParam = encodeURIComponent("/invoices");
    await submitValidLogin();
    expect(pushMock).toHaveBeenCalledWith("/invoices");
  });

  it.each([
    ["protocol-relative //evil.com", "//evil.com"],
    ["backslash bypass /\\evil.com", "/\\evil.com"],
    ["absolute https://evil.com", "https://evil.com"],
  ])("rejects an open-redirect ?next= (%s) and falls back to /dashboard", async (_label, malicious) => {
    mockNextParam = encodeURIComponent(malicious);
    await submitValidLogin();
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(pushMock).not.toHaveBeenCalledWith(malicious);
  });

  it("shows an inline error for an invalid email and keeps the submit button disabled", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submitButton = screen.getByRole("button", { name: /ingresar/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText(/correo/i), "not-an-email");
    await user.tab(); // blur the email field

    expect(await screen.findByText(/correo v[aá]lido/i)).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  it("enables the submit button once a valid email and non-empty password are entered", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submitButton = screen.getByRole("button", { name: /ingresar/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText(/correo/i), "demo@negociodemo.test");
    await user.type(screen.getByLabelText(/contrase/i, { selector: "input" }), "demo1234");

    expect(submitButton).toBeEnabled();
  });

  it("toggles the password field's type between password and text via the eye button", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText(/contrase/i, { selector: "input" });
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /mostrar contrase/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /ocultar contrase/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
