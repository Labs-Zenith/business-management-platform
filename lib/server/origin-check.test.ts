import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { checkOrigin } from "./origin-check";

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

afterEach(() => {
  if (ORIGINAL_APP_ORIGIN === undefined) {
    delete process.env.APP_ORIGIN;
  } else {
    process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
  }
});

function buildRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/customers", {
    method: "POST",
    headers,
  });
}

describe("checkOrigin", () => {
  it("passes when Content-Type is application/json and Origin matches APP_ORIGIN", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";

    expect(() =>
      checkOrigin(buildRequest({ "content-type": "application/json", origin: "http://localhost:3000" })),
    ).not.toThrow();
  });

  it("throws a FORBIDDEN ApiError when Origin does not match APP_ORIGIN", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";

    expect(() =>
      checkOrigin(buildRequest({ "content-type": "application/json", origin: "http://evil.test" })),
    ).toThrow(ApiError);
    try {
      checkOrigin(buildRequest({ "content-type": "application/json", origin: "http://evil.test" }));
      throw new Error("expected checkOrigin to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
  });

  it("falls back to Referer when the Origin header is absent", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";

    expect(() =>
      checkOrigin(
        buildRequest({ "content-type": "application/json", referer: "http://localhost:3000/customers" }),
      ),
    ).not.toThrow();
  });

  it("throws FORBIDDEN when neither Origin nor Referer is present", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";

    expect(() => checkOrigin(buildRequest({ "content-type": "application/json" }))).toThrow(ApiError);
  });

  it("throws a VALIDATION_ERROR when Content-Type is not application/json", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";

    expect(() =>
      checkOrigin(buildRequest({ "content-type": "text/plain", origin: "http://localhost:3000" })),
    ).toThrow(ApiError);
    try {
      checkOrigin(buildRequest({ "content-type": "text/plain", origin: "http://localhost:3000" }));
      throw new Error("expected checkOrigin to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    }
  });

  it("does not throw when APP_ORIGIN is not configured (fails open — local dev without .env)", () => {
    delete process.env.APP_ORIGIN;

    expect(() => checkOrigin(buildRequest({ "content-type": "application/json" }))).not.toThrow();
  });
});
