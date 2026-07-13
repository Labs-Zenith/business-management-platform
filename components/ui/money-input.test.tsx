import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MoneyInput, QuantityInput } from "./money-input";

describe("MoneyInput", () => {
  it("displays a raw value with COP thousands grouping", () => {
    render(<MoneyInput value="150000" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveValue("150.000");
  });

  it("renders an empty input when value is ''", () => {
    render(<MoneyInput value="" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("calls onChange with '' when the field is cleared, and can then display empty (no forced 0)", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MoneyInput value="150000" onChange={onChange} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith("");

    rerender(<MoneyInput value="" onChange={onChange} />);
    expect(input).toHaveValue("");
  });

  it("calls onChange with the canonical RAW string when digits are typed", () => {
    const onChange = vi.fn();
    render(<MoneyInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "150000" } });

    expect(onChange).toHaveBeenCalledWith("150000");
  });

  it("calls onChange with a '.' decimal (not ',') when the user types the COP decimal separator", () => {
    const onChange = vi.fn();
    render(<MoneyInput value="150000" onChange={onChange} />);

    // Simulates the full field contents after the user types "," at the end
    // of the already-grouped display ("150.000" -> "150.000,").
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "150.000,5" } });

    expect(onChange).toHaveBeenCalledWith("150000.5");
  });

  it("uses inputMode='decimal' so mobile shows a numeric keypad with a decimal key", () => {
    render(<MoneyInput value="" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "decimal");
  });

  it("sets data-slot='money-input' for styling/testing consistency", () => {
    render(<MoneyInput value="" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveAttribute("data-slot", "money-input");
  });
});

describe("QuantityInput", () => {
  it("rejects a typed ',' (no decimals allowed) — the comma is dropped, digits are kept", () => {
    const onChange = vi.fn();
    render(<QuantityInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "12,5" } });

    expect(onChange).toHaveBeenCalledWith("125");
  });

  it("uses inputMode='numeric' (no decimal key needed)", () => {
    render(<QuantityInput value="" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "numeric");
  });

  it("displays a raw value with COP thousands grouping, same as MoneyInput", () => {
    render(<QuantityInput value="1000" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveValue("1.000");
  });
});
