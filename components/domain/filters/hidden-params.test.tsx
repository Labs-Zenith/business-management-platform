import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { HiddenParams } from "./hidden-params";

describe("HiddenParams", () => {
  it("renders one hidden input per defined param", () => {
    const { container } = render(<HiddenParams params={{ customerId: "c1", sort: "total", dir: "asc" }} />);

    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.map((input) => [input.name, input.value, input.type])).toEqual([
      ["customerId", "c1", "hidden"],
      ["sort", "total", "hidden"],
      ["dir", "asc", "hidden"],
    ]);
  });

  it("skips undefined and empty values, so a GET submit stays free of blank params", () => {
    const { container } = render(<HiddenParams params={{ customerId: undefined, status: "", sort: "name" }} />);

    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.map((input) => input.name)).toEqual(["sort"]);
  });

  it("renders nothing when there is nothing to carry", () => {
    const { container } = render(<HiddenParams params={{ a: undefined, b: "" }} />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});
