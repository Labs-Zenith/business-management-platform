/**
 * Username-based login shim. Supabase Auth is email-based, but users are
 * provisioned under a fixed internal domain so they can sign in with just a
 * username (no `@`). The login form maps the identifier to an email via
 * `usernameToEmail` before calling the API; anything that already contains
 * `@` (e.g. the legacy `demo@negociodemo.test`) passes through unchanged, so
 * both styles keep working.
 *
 * `create-user.mjs` uses the SAME domain when provisioning `--username` users,
 * so the email it stores in Supabase matches what the login builds.
 */
export const INTERNAL_EMAIL_DOMAIN = "zenith.app";

/** `printingcompany` → `printingcompany@zenith.app`; `a@b.com` → `a@b.com`. */
export function usernameToEmail(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? trimmed : `${trimmed}@${INTERNAL_EMAIL_DOMAIN}`;
}

/**
 * Display form: hides the internal `@zenith.app` domain so the UI shows just
 * the username. A real email on any OTHER domain (e.g. the legacy
 * `demo@negociodemo.test`) passes through unchanged.
 * `printingcompany@zenith.app` → `printingcompany`.
 */
export function emailToUsername(identifier: string): string {
  const suffix = `@${INTERNAL_EMAIL_DOMAIN}`;
  return identifier.endsWith(suffix) ? identifier.slice(0, -suffix.length) : identifier;
}
