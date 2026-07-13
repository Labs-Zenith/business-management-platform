import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Derives an avatar's initial letter from a name/email, uppercased. Falls
 * back to `"?"` when `value` is empty or whitespace-only (review-fix pass —
 * `business-switcher.tsx`'s previous inline `charAt(0)` returned an empty
 * string for an empty business name, rendering a blank avatar). Shared by
 * `business-switcher.tsx` (business name initial) and `dashboard-topbar.tsx`
 * (session email initial), which previously each derived this inline and
 * independently.
 */
export function avatarInitial(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "?";
}
