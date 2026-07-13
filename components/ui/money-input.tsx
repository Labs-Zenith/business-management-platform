"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  formatForDisplay,
  maskOptionsForCurrency,
  sanitizeRawInput,
  type NumericMaskOptions,
} from "@/lib/format/numeric-mask";

export type MoneyInputProps = {
  id?: string;
  name?: string;
  /** RAW string ("" when empty; "." decimal, e.g. "150000.5"). */
  value: string;
  /** Receives the RAW string on every keystroke. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Defaults to "COP". */
  currencyCode?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
};

export type QuantityInputProps = Omit<MoneyInputProps, "currencyCode">;

type NumericMaskInputProps = MoneyInputProps & {
  allowDecimals: boolean;
  maxDecimals: number;
};

/** Is `char` a digit or the mask's decimal separator ("significant" for caret math)? */
function isSignificant(char: string | undefined, opts: NumericMaskOptions): boolean {
  return char !== undefined && ((char >= "0" && char <= "9") || char === opts.decimalSeparator);
}

/** Counts significant chars (digits + decimal separator) in `text` before index `caret`. */
export function countSignificantBefore(text: string, caret: number, opts: NumericMaskOptions): number {
  let count = 0;
  for (let i = 0; i < caret && i < text.length; i++) {
    if (isSignificant(text[i], opts)) count++;
  }
  return count;
}

/** Finds the index in `display` positioned just after the `sig`-th significant char. */
export function caretIndexAfterSignificant(display: string, sig: number, opts: NumericMaskOptions): number {
  if (sig <= 0) return 0;
  let count = 0;
  for (let i = 0; i < display.length; i++) {
    if (isSignificant(display[i], opts)) {
      count++;
      if (count === sig) return i + 1;
    }
  }
  return display.length;
}

/**
 * Shared implementation behind `MoneyInput`/`QuantityInput`. The displayed
 * value is ALWAYS `formatForDisplay(value, opts)` computed fresh on every
 * render — there is no internal string state duplicating `value`, so the
 * field can genuinely be empty.
 */
function NumericMaskInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  currencyCode = "COP",
  placeholder,
  required,
  disabled,
  className,
  allowDecimals,
  maxDecimals,
  "aria-invalid": ariaInvalid,
}: NumericMaskInputProps) {
  const opts = maskOptionsForCurrency(currencyCode, { allowDecimals, maxDecimals });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const display = formatForDisplay(value, opts);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const inputEl = event.target;
    const typed = inputEl.value;
    const caret = inputEl.selectionStart ?? typed.length;
    const sig = countSignificantBefore(typed, caret, opts);

    const next = sanitizeRawInput(typed, opts);
    const nextDisplay = formatForDisplay(next, opts);
    const nextCaret = caretIndexAfterSignificant(nextDisplay, sig, opts);

    // Reconcile the DOM value + caret synchronously here so this works even
    // when `next` equals the current raw `value` — in that case React skips
    // the re-render (same props in, same output out) and a display-keyed
    // effect would never fire, leaving the caret wherever the browser put it
    // (the end). Setting `.value` imperatively matches what React would
    // render anyway for keystroke-driven changes, so React's next
    // reconciliation is a no-op on the DOM and this restored caret survives.
    inputEl.value = nextDisplay;
    inputEl.setSelectionRange(nextCaret, nextCaret);

    onChange(next);
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode={allowDecimals ? "decimal" : "numeric"}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className={className}
      aria-invalid={ariaInvalid}
      data-slot="money-input"
    />
  );
}

export function MoneyInput(props: MoneyInputProps) {
  return <NumericMaskInput {...props} allowDecimals maxDecimals={2} />;
}

export function QuantityInput(props: QuantityInputProps) {
  return <NumericMaskInput {...props} allowDecimals={false} maxDecimals={0} />;
}
