import { formatCOP } from "@/lib/money";
import { cn } from "@/lib/utils";

export type MoneyAmountSize = "sm" | "lg";

export type MoneyAmountProps = {
  /** Integer minor units (COP cents), per `lib/money.ts`'s convention. */
  cents: number;
  /**
   * `"sm"` (default) — table cells, list rows, and secondary figures.
   * `"lg"` — the hero figure: dashboard KPI cards and invoice/receipt grand
   * totals, rendered bolder and larger.
   */
  size?: MoneyAmountSize;
  className?: string;
};

const SIZE_CLASSES: Record<MoneyAmountSize, string> = {
  sm: "text-sm font-medium",
  lg: "text-2xl font-semibold",
};

/**
 * Renders a formatted COP amount in Geist Mono with tabular figures — the
 * app's one deliberate typographic signature for money (aligned tabular
 * figures, a real financial-app convention). Use this everywhere an amount
 * is displayed instead of calling `formatCOP` directly in JSX, so every
 * monetary figure in the app shares the same treatment.
 */
export function MoneyAmount({ cents, size = "sm", className }: MoneyAmountProps) {
  return <span className={cn("font-mono tabular-nums", SIZE_CLASSES[size], className)}>{formatCOP(cents)}</span>;
}
