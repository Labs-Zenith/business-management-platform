import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Part C1 (cookie hardening) — encrypts secret-bearing cookie payloads
 * (currently `saved_accounts`, which stores refresh tokens; see
 * `lib/supabase/auth-adapter.ts` and `lib/mock/auth-adapter.ts`) at rest in
 * the browser using AES-256-GCM (`node:crypto`), so the cookie value is
 * opaque ciphertext rather than readable JSON — defense in depth alongside
 * `httpOnly` (which already blocks JS access; this additionally blocks a
 * human/tool simply reading the cookie jar, e.g. via DevTools' "Application"
 * tab, browser sync, or a backup).
 *
 * Format: `${iv}.${authTag}.${ciphertext}`, each segment base64url-encoded.
 * `openJson` is fail-safe: ANY error (malformed format, wrong/tampered auth
 * tag, bad JSON, wrong key) returns `null` rather than throwing — callers
 * treat a `null` result identically to "no saved cookie" (see
 * `readSavedAccounts` in both adapters).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Local dev/test-only encryption fallback. NEVER used in production — see
 * `resolveCookieSecret` below, which throws (fail loud, not silent) the
 * first time a cookie is actually sealed/opened if `NODE_ENV === "production"`
 * and `COOKIE_SECRET` is unset, rather than silently encrypting production
 * cookies with this well-known value. Mirrors
 * `lib/mock/auth-adapter.ts`'s `resolveSessionSecret`/
 * `DEV_FALLBACK_SESSION_SECRET` posture exactly.
 *
 * Resolved LAZILY (memoized on first use), for the same reason as
 * `resolveSessionSecret`: `next build`'s "Collecting page data" step sets
 * `NODE_ENV=production` and may import this module without ever serving a
 * real request — an eager top-level throw would fail every production
 * build, not just an actually-misconfigured production runtime.
 */
const DEV_FALLBACK_COOKIE_SECRET = "dev-insecure-cookie-secret-do-not-use-in-production";

let cachedCookieSecret: string | null = null;
let warnedDevFallback = false;

function resolveCookieSecret(): string {
  if (cachedCookieSecret !== null) {
    return cachedCookieSecret;
  }
  const configured = process.env.COOKIE_SECRET;
  if (configured) {
    cachedCookieSecret = configured;
    return cachedCookieSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "COOKIE_SECRET is required in production (see .env.example) — refusing to " +
        "encrypt cookies with the known dev fallback secret."
    );
  }
  if (!warnedDevFallback) {
    console.warn(
      "[cookie-crypto] COOKIE_SECRET is not set — using an insecure dev-only fallback key. " +
        "Set COOKIE_SECRET in production (see .env.example)."
    );
    warnedDevFallback = true;
  }
  cachedCookieSecret = DEV_FALLBACK_COOKIE_SECRET;
  return cachedCookieSecret;
}

/** Derives a 32-byte AES-256 key from the configured/fallback secret. */
function deriveKey(): Buffer {
  return createHash("sha256").update(resolveCookieSecret()).digest();
}

/**
 * Encrypts `value` (JSON-serialized) into an opaque `iv.authTag.ciphertext`
 * string (all three segments base64url). A fresh random IV is generated per
 * call — never reused.
 */
export function sealJson(value: unknown): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = Buffer.from(JSON.stringify(value), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(
    "."
  );
}

/**
 * Decrypts a string produced by `sealJson` back into `T`. Fail-safe: returns
 * `null` (never throws) for a malformed format, a wrong/tampered GCM auth
 * tag, invalid JSON, or a value sealed under a different key — the caller is
 * expected to treat `null` exactly like "nothing stored" (see
 * `readSavedAccounts` in both auth adapters).
 */
export function openJson<T>(raw: string): T | null {
  try {
    const parts = raw.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const [ivPart, authTagPart, ciphertextPart] = parts;

    const iv = Buffer.from(ivPart!, "base64url");
    const authTag = Buffer.from(authTagPart!, "base64url");
    const ciphertext = Buffer.from(ciphertextPart!, "base64url");

    const key = deriveKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf-8")) as T;
  } catch {
    return null;
  }
}
