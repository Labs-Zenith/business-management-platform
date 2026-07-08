import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function buildRequest(path: string, cookieValue?: string): NextRequest {
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `session=${cookieValue}`);
  }
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe("middleware", () => {
  it("redirects unauthenticated requests to a protected dashboard route to /login", () => {
    const response = middleware(buildRequest("/dashboard"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to a protected (print) route to /login", () => {
    const response = middleware(buildRequest("/invoices/some-id/receipt"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated requests to /api/docs to /login", () => {
    const response = middleware(buildRequest("/api/docs"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("allows requests to a protected route through when a session cookie is present", () => {
    const response = middleware(buildRequest("/dashboard", "opaque-token-value"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect requests to public paths like /login", () => {
    const response = middleware(buildRequest("/login"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect requests to public auth API routes", () => {
    const response = middleware(buildRequest("/api/auth/login"));

    expect(response.headers.get("location")).toBeNull();
  });
});
