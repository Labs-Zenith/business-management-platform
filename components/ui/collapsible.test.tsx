import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "./collapsible"

describe("Collapsible", () => {
  it("toggles the panel's data-open state when the trigger is clicked", async () => {
    const user = userEvent.setup()
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsiblePanel>Panel content</CollapsiblePanel>
      </Collapsible>
    )

    const trigger = screen.getByRole("button", { name: "Toggle" })

    expect(screen.queryByText("Panel content")).not.toBeInTheDocument()

    await user.click(trigger)

    const panel = await screen.findByText("Panel content")
    expect(panel).toHaveAttribute("data-open")

    await user.click(trigger)

    expect(screen.queryByText("Panel content")).not.toBeInTheDocument()
  })
})
