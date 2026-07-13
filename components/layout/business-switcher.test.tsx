import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));

import BusinessSwitcher from "./business-switcher";

const SINGLE: BusinessMembership[] = [
  { businessId: "biz-1", businessName: "Negocio Demo", role: "admin" },
];

const MULTIPLE: BusinessMembership[] = [
  { businessId: "biz-1", businessName: "Negocio Demo", role: "admin" },
  { businessId: "biz-2", businessName: "Negocio Demo 2", role: "admin" },
];

/**
 * Mirrors `logout-button.test.tsx`'s fetch-mocking pattern (POST an auth
 * endpoint, assert the resulting side effect / error state).
 *
 * The trigger is now a small round avatar (no visible business name), so
 * assertions target its accessible name/title (still the business name,
 * per accessibility requirement) and its `AvatarFallback` initial letter,
 * instead of visible label text.
 */
describe("BusinessSwitcher", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a non-interactive avatar (no dropdown) showing the business initial when there is only 1 membership", () => {
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={SINGLE} />);

    const avatar = screen.getByTitle("Negocio Demo");
    expect(avatar).toBeInTheDocument();
    expect(within(avatar).getByText("N")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a dropdown avatar trigger (showing the business initial) listing the other businesses when there are 2+ memberships", async () => {
    const user = userEvent.setup();
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    const trigger = screen.getByRole("button", { name: "Negocio Demo" });
    expect(trigger).toBeInTheDocument();
    expect(within(trigger).getByText("N")).toBeInTheDocument();

    await user.click(trigger);

    expect(await screen.findByRole("menuitem", { name: "Negocio Demo 2" })).toBeInTheDocument();
    // The currently active business is the trigger's accessible name, not a selectable item.
    expect(screen.queryByRole("menuitem", { name: "Negocio Demo" })).not.toBeInTheDocument();
  });

  it("POSTs to /api/auth/switch-business and refreshes on success when a different business is selected", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { session: { userId: "u1", businessId: "biz-2", email: "demo@test.com", role: "admin" } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Negocio Demo 2" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch-business",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ businessId: "biz-2" }),
      })
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows an inline error and does not crash when the switch request fails (e.g. 403 not-a-member race)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { code: "FORBIDDEN", message: "You are not a member of this business." },
        }),
      })
    );

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Negocio Demo 2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are not a member of this business."
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows a generic inline error on a network failure without crashing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Negocio Demo 2" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("marks the trigger aria-disabled and updates its accessible name while the switch request is in flight, and ignores a second interaction until it settles", async () => {
    const user = userEvent.setup();

    // A manually-controlled/deferred promise: `fetch` doesn't resolve until
    // this test explicitly calls `resolveFetch(...)`, so the pending window
    // is actually observable instead of the request resolving synchronously
    // in the same microtask tick as `mockResolvedValue` would.
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const deferred = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(deferred);
    vi.stubGlobal("fetch", fetchMock);

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Negocio Demo 2" }));

    // Pending state is now real and observable: the trigger's accessible
    // name changes and it is marked `aria-disabled`, BEFORE the request has
    // settled. (The trigger is a non-native element — a `<span>` via
    // `Avatar` — so real HTML `disabled` never applies; `aria-disabled` is
    // the correct signal here, not `toBeDisabled()`.)
    const trigger = await screen.findByRole("button", { name: /cambiando/i });
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A second interaction attempt while pending: base-ui's click
    // interaction is disabled while `disabled` is true, so clicking the
    // trigger again must not open a new dropdown or fire a second fetch.
    await user.click(trigger);
    expect(screen.queryByRole("menuitem", { name: "Negocio Demo 2" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({
        data: { session: { userId: "u1", businessId: "biz-2", email: "demo@test.com", role: "admin" } },
      }),
    });

    // `currentBusinessId` is still "biz-1" here — this component doesn't
    // own that value, its parent does via `session.businessId` after
    // `router.refresh()` re-fetches Server Component data — so the trigger
    // reverts to its original accessible name once `isSwitching` clears.
    const settledTrigger = await screen.findByRole("button", { name: "Negocio Demo" });
    expect(settledTrigger).not.toHaveAttribute("aria-disabled", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalled();
  });

  it("falls back to '?' (never a blank avatar) when the current membership's business name is empty", () => {
    const EMPTY_NAME: BusinessMembership[] = [{ businessId: "biz-1", businessName: "", role: "admin" }];

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={EMPTY_NAME} />);

    const avatar = screen.getByTitle("");
    expect(within(avatar).getByText("?")).toBeInTheDocument();
  });

  it("renders the generic fallback avatar with no dropdown when memberships is empty", () => {
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={[]} />);

    const avatar = screen.getByTitle("Negocio");
    expect(avatar).toBeInTheDocument();
    expect(within(avatar).getByText("N")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders without crashing when currentBusinessId matches none of the memberships (data-inconsistency case)", async () => {
    // Known-acceptable degraded state: with no matching membership, the
    // trigger falls back to the generic "Negocio" label/initial and every
    // seeded membership (including one that might coincidentally share a
    // name) is offered as a switch target. This is a pre-existing, safe-but-
    // imperfect behavior being locked in here, not a new design decision.
    const user = userEvent.setup();
    render(<BusinessSwitcher currentBusinessId="biz-unknown" memberships={MULTIPLE} />);

    const trigger = screen.getByRole("button", { name: "Negocio" });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    expect(await screen.findByRole("menuitem", { name: "Negocio Demo" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Negocio Demo 2" })).toBeInTheDocument();
  });
});
