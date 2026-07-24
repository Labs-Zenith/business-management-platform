import { describe, expect, it } from "vitest";
import { emailToUsername, usernameToEmail, INTERNAL_EMAIL_DOMAIN } from "./username";

describe("usernameToEmail", () => {
  it("appends the internal domain to a bare username", () => {
    expect(usernameToEmail("printingcompany")).toBe(`printingcompany@${INTERNAL_EMAIL_DOMAIN}`);
  });

  it("passes a value that already contains @ through unchanged", () => {
    expect(usernameToEmail("demo@negociodemo.test")).toBe("demo@negociodemo.test");
  });
});

describe("emailToUsername (display)", () => {
  it("strips the internal @zenith.app domain, showing just the username", () => {
    expect(emailToUsername(`printingcompany@${INTERNAL_EMAIL_DOMAIN}`)).toBe("printingcompany");
    expect(emailToUsername(`lch@${INTERNAL_EMAIL_DOMAIN}`)).toBe("lch");
  });

  it("leaves a real email on any other domain unchanged", () => {
    expect(emailToUsername("demo@negociodemo.test")).toBe("demo@negociodemo.test");
  });

  it("is the inverse of usernameToEmail for internal usernames", () => {
    expect(emailToUsername(usernameToEmail("kahalaa"))).toBe("kahalaa");
  });
});
