import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

/**
 * The real `api-reference-client.tsx` lazy-loads Scalar
 * (`dynamic(..., {ssr:false})`), which is irrelevant to THIS page's own
 * responsibility (session gating) — mocked here so this test never depends
 * on Scalar's actual rendering behavior.
 */
vi.mock("@/components/domain/docs/api-reference-client", () => ({
  default: () => <div data-testid="api-reference-client">Scalar API Reference</div>,
}));

import ApiDocsPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("ApiDocsPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
  });

  it("renders the API reference client when authenticated", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);

    render(await ApiDocsPage());

    expect(mockRequireSessionOrRedirect).toHaveBeenCalled();
    expect(screen.getByTestId("api-reference-client")).toBeInTheDocument();
  });

  it("blocks unauthenticated access: redirects to /login instead of crashing", async () => {
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(ApiDocsPage()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});
