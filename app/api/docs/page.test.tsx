import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/server/api-error";
import type { Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
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
};

describe("ApiDocsPage", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
  });

  it("renders the API reference client when authenticated", async () => {
    mockRequireSession.mockResolvedValue(SESSION);

    render(await ApiDocsPage());

    expect(mockRequireSession).toHaveBeenCalled();
    expect(screen.getByTestId("api-reference-client")).toBeInTheDocument();
  });

  it("blocks unauthenticated access: propagates requireSession's UNAUTHENTICATED rejection", async () => {
    mockRequireSession.mockRejectedValue(new ApiError("UNAUTHENTICATED", "Authentication required."));

    await expect(ApiDocsPage()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
