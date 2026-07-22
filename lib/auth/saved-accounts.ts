/**
 * Single source of truth for how many "remember me" accounts a device may
 * keep in the `saved_accounts` cookie. Enforced server-side in both auth
 * adapters' `signIn` (`.slice(-MAX_SAVED_ACCOUNTS)`), and used by the UI
 * (`profile-picker.tsx`, `business-switcher.tsx`) to block the "add another
 * account" affordance once the cap is reached (the user must remove one
 * first).
 */
export const MAX_SAVED_ACCOUNTS = 2;
