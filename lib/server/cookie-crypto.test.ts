import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openJson, sealJson } from "./cookie-crypto";

const ORIGINAL_COOKIE_SECRET = process.env.COOKIE_SECRET;

function restoreCookieSecret(): void {
  if (ORIGINAL_COOKIE_SECRET === undefined) {
    delete process.env.COOKIE_SECRET;
  } else {
    process.env.COOKIE_SECRET = ORIGINAL_COOKIE_SECRET;
  }
}

describe("cookie-crypto", () => {
  beforeEach(() => {
    // A fixed, test-only secret so every test in this file uses the SAME
    // derived key (resolveCookieSecret memoizes on first use, so the "seal
    // under a different key" test below uses a fresh module instance
    // instead of mutating env mid-file).
    process.env.COOKIE_SECRET = "test-cookie-secret-for-vitest-only";
  });

  afterEach(() => {
    restoreCookieSecret();
  });

  it("round-trips an object through sealJson -> openJson", () => {
    const value = { userId: "u1", email: "demo@negociodemo.test", refreshToken: "super-secret-token" };

    const sealed = sealJson(value);
    const opened = openJson<typeof value>(sealed);

    expect(opened).toEqual(value);
  });

  it("round-trips an array (the actual saved_accounts shape)", () => {
    const value = [
      { userId: "u1", email: "a@test.com", label: "a@test.com", refreshToken: "token-a" },
      { userId: "u2", email: "b@test.com", label: "b@test.com", refreshToken: "token-b" },
    ];

    const sealed = sealJson(value);
    const opened = openJson<typeof value>(sealed);

    expect(opened).toEqual(value);
  });

  it("produces an opaque string that does not contain the plaintext", () => {
    const value = { refreshToken: "super-secret-token-should-not-leak", email: "demo@negociodemo.test" };

    const sealed = sealJson(value);

    expect(sealed).not.toContain("super-secret-token-should-not-leak");
    expect(sealed).not.toContain("demo@negociodemo.test");
    expect(sealed.split(".")).toHaveLength(3);
  });

  it("returns null for a tampered ciphertext (GCM auth tag fails)", () => {
    const sealed = sealJson({ hello: "world" });
    const [iv, tag, ciphertext] = sealed.split(".");
    // Flip the last character of the ciphertext segment.
    const tamperedChar = ciphertext!.at(-1) === "A" ? "B" : "A";
    const tampered = `${iv}.${tag}.${ciphertext!.slice(0, -1)}${tamperedChar}`;

    expect(openJson(tampered)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(openJson("not-a-valid-sealed-value")).toBeNull();
    expect(openJson("a.b")).toBeNull();
    expect(openJson("a.b.c.d")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(openJson("")).toBeNull();
  });

  it("returns null when opened with a different key than it was sealed with", async () => {
    // resolveCookieSecret memoizes on first use per module instance, so a
    // fresh module registry (vi.resetModules) is needed to pick up each
    // distinct COOKIE_SECRET below, mirroring how a real process only ever
    // resolves the secret once per lifetime.
    vi.resetModules();
    process.env.COOKIE_SECRET = "key-one-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { sealJson: sealWithKeyOne } = await import("./cookie-crypto");
    const sealed = sealWithKeyOne({ secret: "value" });

    vi.resetModules();
    process.env.COOKIE_SECRET = "key-two-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const { openJson: openWithKeyTwo } = await import("./cookie-crypto");

    expect(openWithKeyTwo(sealed)).toBeNull();
  });
});
