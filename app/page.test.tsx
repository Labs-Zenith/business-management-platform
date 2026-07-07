import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home page", () => {
  it("renders without crashing", () => {
    render(<Home />);
    expect(
      screen.getByText(/to get started, edit the page\.tsx file\./i)
    ).toBeInTheDocument();
  });
});
