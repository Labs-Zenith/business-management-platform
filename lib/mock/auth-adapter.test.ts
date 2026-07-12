import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { BUSINESS_ID, BUSINESS_ID_2 } from "@/lib/mock/fixtures/data";

/**
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context (AsyncLocalStorage-backed). Calling `authAdapter` methods
 * directly in Vitest bypasses that context entirely, so we mock the
 * primitive with a small stateful, in-memory cookie jar shared across a
 * single test — same pattern as `app/api/auth/auth-routes.test.ts`.
 */
const { mockCookieJar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockCookieJar: {
      get(name: string) {
        return store.has(name) ? { name, value: store.get(name)! } : undefined;
      },
      set(name: string, value: string) {
        store.set(name, value);
      },
      delete(name: string) {
        store.delete(name);
      },
      clear() {
        store.clear();
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => mockCookieJar,
}));

const { authAdapter } = await import("./auth-adapter");

const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

describe("authAdapter.getSession — decodeSession guard", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects a role-less cookie (old cookie shape), forcing re-login", async () => {
    const roleLessSession = {
      userId: "20000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      email: DEMO_EMAIL,
      // no `role` field — simulates a pre-migration cookie
    };
    const token = Buffer.from(JSON.stringify(roleLessSession), "utf-8").toString("base64url");
    mockCookieJar.set("session", token);

    const session = await authAdapter.getSession();

    expect(session).toBeNull();
  });

  it("accepts a well-formed cookie including `role`", async () => {
    await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);

    const session = await authAdapter.getSession();

    expect(session).not.toBeNull();
    expect(session!.role).toBe("admin");
  });
});

describe("authAdapter.signIn — default business selection", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("picks the earliest-created membership (BUSINESS_ID, not BUSINESS_ID_2) as the default active business", async () => {
    const session = await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);

    expect(session).not.toBeNull();
    expect(session!.businessId).toBe(BUSINESS_ID);
    expect(session!.businessId).not.toBe(BUSINESS_ID_2);
    expect(session!.role).toBe("admin");
  });

  it("returns null for incorrect credentials and never sets a cookie", async () => {
    const session = await authAdapter.signIn(DEMO_EMAIL, "wrong-password");

    expect(session).toBeNull();
    expect(mockCookieJar.get("session")).toBeUndefined();
  });
});

describe("authAdapter.switchBusiness", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("returns null when there is no prior session", async () => {
    const result = await authAdapter.switchBusiness(BUSINESS_ID_2);

    expect(result).toBeNull();
    expect(mockCookieJar.get("session")).toBeUndefined();
  });

  it("re-issues the cookie with the target businessId and the membership's OWN stored role, keeping userId/email", async () => {
    const original = await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    expect(original!.businessId).toBe(BUSINESS_ID);
    expect(original!.role).toBe("admin");

    const switched = await authAdapter.switchBusiness(BUSINESS_ID_2);

    expect(switched).not.toBeNull();
    expect(switched!.userId).toBe(original!.userId);
    expect(switched!.email).toBe(original!.email);
    expect(switched!.businessId).toBe(BUSINESS_ID_2);
    // Both seeded demo memberships are role:'admin' — this proves the role
    // came from BUSINESS_ID_2's OWN membership row, not merely "whatever the
    // caller passed" (there is no caller-supplied role anymore).
    expect(switched!.role).toBe("admin");

    // The re-issued cookie reflects the switch on the very next read.
    const persisted = await authAdapter.getSession();
    expect(persisted).toEqual(switched);
  });

  it("returns null (rejects the switch, current session untouched) when the current user has no membership for the target businessId — never forging a session for a business they don't belong to", async () => {
    const original = await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);
    const NON_MEMBER_BUSINESS_ID = "10000000-0000-4000-8000-00000000dead";

    const result = await authAdapter.switchBusiness(NON_MEMBER_BUSINESS_ID);

    expect(result).toBeNull();

    // The current session cookie is untouched — still scoped to the
    // original business, not re-issued for the non-member business.
    const persisted = await authAdapter.getSession();
    expect(persisted).toEqual(original);
    expect(persisted!.businessId).toBe(BUSINESS_ID);
  });
});

describe("session cookie signing (HMAC-SHA256)", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("round-trips correctly: sign (signIn) then verify (getSession) accepts the cookie, whose shape is `${payload}.${signature}`", async () => {
    await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);

    const token = mockCookieJar.get("session")!.value;
    const lastDot = token.lastIndexOf(".");
    expect(lastDot).toBeGreaterThan(-1);
    expect(token.slice(0, lastDot).length).toBeGreaterThan(0);
    expect(token.slice(lastDot + 1).length).toBeGreaterThan(0);

    const session = await authAdapter.getSession();
    expect(session).not.toBeNull();
    expect(session!.role).toBe("admin");
  });

  it("rejects a tampered cookie: valid payload, corrupted signature", async () => {
    await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);

    const token = mockCookieJar.get("session")!.value;
    const lastDot = token.lastIndexOf(".");
    const payload = token.slice(0, lastDot);
    const signature = token.slice(lastDot + 1);
    // Flip one character of the (base64url) signature -- same length, wrong bytes.
    const tamperedChar = signature.at(-1) === "A" ? "B" : "A";
    const tamperedSignature = signature.slice(0, -1) + tamperedChar;
    mockCookieJar.set("session", `${payload}.${tamperedSignature}`);

    expect(await authAdapter.getSession()).toBeNull();
  });

  it("rejects a cookie with the signature segment stripped entirely (malformed, no `.`)", async () => {
    await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);

    const token = mockCookieJar.get("session")!.value;
    const payloadOnly = token.slice(0, token.lastIndexOf("."));
    mockCookieJar.set("session", payloadOnly);

    expect(await authAdapter.getSession()).toBeNull();
  });

  it("rejects a cookie whose signature was computed with a different secret", async () => {
    await authAdapter.signIn(DEMO_EMAIL, DEMO_PASSWORD);

    const token = mockCookieJar.get("session")!.value;
    const payload = token.slice(0, token.lastIndexOf("."));
    const foreignSignature = createHmac("sha256", "a-completely-different-secret")
      .update(payload)
      .digest("base64url");
    mockCookieJar.set("session", `${payload}.${foreignSignature}`);

    expect(await authAdapter.getSession()).toBeNull();
  });
});
