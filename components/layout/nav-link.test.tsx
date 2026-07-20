import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NavLink } from "./nav-link";
import { NAV_ITEMS } from "./nav-items";

const DASHBOARD_ITEM = NAV_ITEMS.find((item) => item.href === "/dashboard")!;

/**
 * Plan Part C: with the sidebar collapsed (`nav-link.tsx`'s `collapsed`
 * branch), hovering or focusing a nav icon must show its label in a real,
 * styled `Tooltip` (`components/ui/tooltip.tsx`, base-ui) — not just the
 * slow/unstyled native `title` attribute (kept as a fallback, see that
 * file's doc comment, but no longer the primary affordance).
 */
describe("NavLink", () => {
  it("renders the label inline and shows no tooltip when expanded", () => {
    render(<NavLink item={DASHBOARD_ITEM} active={false} />);

    const link = screen.getByRole("link", { name: DASHBOARD_ITEM.label });
    expect(link).toBeInTheDocument();
    expect(link.querySelector("span")).toHaveTextContent(DASHBOARD_ITEM.label);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("hides the inline label but exposes it via a styled tooltip on hover when collapsed", async () => {
    const user = userEvent.setup();
    render(<NavLink item={DASHBOARD_ITEM} active={false} collapsed />);

    const link = screen.getByRole("link", { name: DASHBOARD_ITEM.label });
    expect(link.querySelector("span")).not.toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(link);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(DASHBOARD_ITEM.label);
  });

  it("shows the tooltip on keyboard focus when collapsed", async () => {
    const user = userEvent.setup();
    render(<NavLink item={DASHBOARD_ITEM} active={false} collapsed />);

    await user.tab();

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(DASHBOARD_ITEM.label);
  });

  it("keeps aria-current, href and onNavigate behavior identical in both collapsed and expanded states", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    const { rerender } = render(
      <NavLink item={DASHBOARD_ITEM} active onNavigate={onNavigate} />
    );
    let link = screen.getByRole("link", { name: DASHBOARD_ITEM.label });
    expect(link).toHaveAttribute("href", DASHBOARD_ITEM.href);
    expect(link).toHaveAttribute("aria-current", "page");
    await user.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);

    rerender(<NavLink item={DASHBOARD_ITEM} active onNavigate={onNavigate} collapsed />);
    link = screen.getByRole("link", { name: DASHBOARD_ITEM.label });
    expect(link).toHaveAttribute("href", DASHBOARD_ITEM.href);
    expect(link).toHaveAttribute("aria-current", "page");
    await user.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });
});
