import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessMembership } from "@/lib/services/ports";

const refreshMock = vi.fn();

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => "/dashboard",
}));

import BusinessSwitcher from "./business-switcher";

// Fase X: switching business/account now does a hard navigation
// (`window.location.assign("/dashboard")`) instead of `router.refresh()`, so
// every prefetched sidebar route drops its previous-business RSC payload
// (see `post()` in `business-switcher.tsx` for the full rationale). jsdom's
// `window.location` isn't directly assignable, so we replace the whole
// object with a spy-backed stand-in before every test.
const assignMock = vi.fn();

beforeEach(() => {
  assignMock.mockReset();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: assignMock },
    writable: true,
    configurable: true,
  });
});

const SINGLE: BusinessMembership[] = [
  { businessId: "biz-1", businessName: "Negocio Demo", role: "admin" },
];

const MULTIPLE: BusinessMembership[] = [
  { businessId: "biz-1", businessName: "Negocio Demo", role: "admin" },
  { businessId: "biz-2", businessName: "Negocio Demo 2", role: "admin" },
];

/**
 * Fase 5.1 Lane B: the switcher is now a `Collapsible`, not a `DropdownMenu`
 * — clicking the trigger expands an INLINE panel below it (no more
 * "Configuración"/"Editar perfil" links; those moved to a plain `Settings`
 * nav item in `nav-items.ts`). The other businesses are rendered as plain
 * `<button>`s (not `menuitem`s) inside that panel.
 *
 * Mirrors `sidebar-user-menu.test.tsx`'s fetch-mocking pattern (POST an
 * auth endpoint, assert the resulting side effect / error state).
 */
describe("BusinessSwitcher", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an avatar + business name trigger, with the other-businesses panel collapsed by default", () => {
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    const trigger = screen.getByRole("button", { name: "Negocio Demo" });
    expect(trigger).toBeInTheDocument();
    expect(within(trigger).getByText("N")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Negocio Demo 2" })).not.toBeInTheDocument();
  });

  it("expands inline to list the other businesses to switch to when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));

    expect(await screen.findByRole("button", { name: "Negocio Demo 2" })).toBeInTheDocument();
  });

  it("renders no other-business options when there is only 1 membership", async () => {
    const user = userEvent.setup();
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={SINGLE} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));

    expect(screen.queryByRole("button", { name: /negocio demo \d/i })).not.toBeInTheDocument();
  });

  it("hides the business name and the chevron icon (avatar-only) when collapsed, but keeps the name as the accessible name", () => {
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={SINGLE} collapsed />);

    expect(screen.queryByText("Negocio Demo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
  });

  it("keeps the other-businesses panel closed in collapsed (rail) mode even when the avatar is clicked", async () => {
    const user = userEvent.setup();
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} collapsed />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));

    // In rail mode the panel is force-closed, so the crammed business names
    // never render into the w-14 rail (regression fix).
    expect(screen.queryByRole("button", { name: "Negocio Demo 2" })).not.toBeInTheDocument();
  });

  it("POSTs to /api/auth/switch-business and hard-navigates to /dashboard on success when a different business is selected", async () => {
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
    await user.click(await screen.findByRole("button", { name: "Negocio Demo 2" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch-business",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ businessId: "biz-2" }),
      })
    );
    expect(assignMock).toHaveBeenCalledWith("/dashboard");
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
    await user.click(await screen.findByRole("button", { name: "Negocio Demo 2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are not a member of this business."
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("shows a generic inline error on a network failure without crashing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={MULTIPLE} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));
    await user.click(await screen.findByRole("button", { name: "Negocio Demo 2" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("disables the trigger and updates its accessible name while the switch request is in flight", async () => {
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
    await user.click(await screen.findByRole("button", { name: "Negocio Demo 2" }));

    // Pending state is now real and observable: the trigger's accessible
    // name changes and it is disabled, BEFORE the request has settled.
    // GOTCHA: base-ui's `CollapsibleTrigger` calls `useButton` with
    // `focusableWhenDisabled: true` internally, so a disabled trigger stays
    // focusable and surfaces as `aria-disabled="true"` rather than the
    // native HTML `disabled` attribute (unlike `sidebar-user-menu.tsx`'s
    // `DropdownMenuTrigger`-composed trigger, which DOES get the real
    // `disabled` attribute).
    const trigger = await screen.findByRole("button", { name: /cambiando/i });
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    // The panel's per-business buttons (a real native `disabled`, unlike the
    // trigger's `aria-disabled`) are also disabled while a switch is in
    // flight, so a user can't click a second business mid-switch.
    expect(screen.getByRole("button", { name: "Negocio Demo 2" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({
        data: { session: { userId: "u1", businessId: "biz-2", email: "demo@test.com", role: "admin" } },
      }),
    });

    // `currentBusinessId` is still "biz-1" here — in the real app the
    // subsequent `window.location.assign("/dashboard")` hard-navigates away
    // before `isSwitching` matters, but the mocked `assign` here is a no-op,
    // so `finally { setIsSwitching(false) }` still runs and the trigger
    // reverts to its original accessible name.
    const settledTrigger = await screen.findByRole("button", { name: "Negocio Demo" });
    expect(settledTrigger).not.toHaveAttribute("aria-disabled", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith("/dashboard");
  });

  it("falls back to '?' (never a blank avatar) when the current membership's business name is empty", () => {
    const EMPTY_NAME: BusinessMembership[] = [{ businessId: "biz-1", businessName: "", role: "admin" }];

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={EMPTY_NAME} />);

    const trigger = screen.getByTitle("");
    expect(within(trigger).getByText("?")).toBeInTheDocument();
  });

  it("renders the generic 'Negocio' fallback avatar + name when memberships is empty", () => {
    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={[]} />);

    const trigger = screen.getByRole("button", { name: "Negocio" });
    expect(trigger).toBeInTheDocument();
    expect(within(trigger).getByText("N")).toBeInTheDocument();
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

    expect(await screen.findByRole("button", { name: "Negocio Demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Negocio Demo 2" })).toBeInTheDocument();
  });
});

describe("BusinessSwitcher — saved accounts (Wave 3)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const OTHER_ACCOUNT = {
    userId: "user-2",
    email: "otra@negocio.test",
    label: "otra@negocio.test",
    active: false,
  };

  it("lists other saved accounts and switches to one via POST /api/auth/switch-account + hard navigation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BusinessSwitcher
        currentBusinessId="biz-1"
        memberships={SINGLE}
        savedAccounts={[
          { userId: "u1", email: "demo@test.com", label: "demo@test.com", active: true },
          OTHER_ACCOUNT,
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));
    await user.click(await screen.findByRole("button", { name: /otra@negocio\.test/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch-account",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "user-2" }) })
    );
    expect(assignMock).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates to /login?next=<current path> when 'Agregar cuenta' is clicked", async () => {
    const user = userEvent.setup();

    render(<BusinessSwitcher currentBusinessId="biz-1" memberships={SINGLE} savedAccounts={[]} />);

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));
    await user.click(await screen.findByRole("button", { name: /agregar cuenta/i }));

    expect(pushMock).toHaveBeenCalledWith("/login?next=%2Fdashboard");
  });

  it("keeps 'Agregar cuenta' enabled even at the 2-account cap (the limit is enforced at /login)", async () => {
    const user = userEvent.setup();

    render(
      <BusinessSwitcher
        currentBusinessId="biz-1"
        memberships={SINGLE}
        savedAccounts={[
          { userId: "u1", email: "demo@test.com", label: "demo@test.com", active: true },
          OTHER_ACCOUNT,
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Negocio Demo" }));

    const addAccountButton = await screen.findByRole("button", { name: /agregar cuenta/i });
    expect(addAccountButton).not.toBeDisabled();

    await user.click(addAccountButton);
    expect(pushMock).toHaveBeenCalledWith("/login?next=%2Fdashboard");
  });
});
