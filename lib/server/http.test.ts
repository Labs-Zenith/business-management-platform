import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "./http";

describe("withApiHandler", () => {
  it("maps a thrown ApiError to the matching JSON {error:{code,message,details}} shape and status code", async () => {
    const handler = withApiHandler<[Request]>(async () => {
      throw new ApiError("NOT_FOUND", "Customer not found.");
    });

    const response = await handler(new Request("http://localhost/api/customers/x"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "NOT_FOUND", message: "Customer not found." } });
  });

  it("includes details from the ApiError when present", async () => {
    const handler = withApiHandler<[Request]>(async () => {
      throw new ApiError("VALIDATION_ERROR", "Invalid payload.", { fieldErrors: { name: ["Required"] } });
    });

    const response = await handler(new Request("http://localhost/api/customers"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.details).toEqual({ fieldErrors: { name: ["Required"] } });
  });

  it("maps a non-ApiError thrown value to a generic 500 INTERNAL_ERROR (never leaks internals)", async () => {
    const handler = withApiHandler<[Request]>(async () => {
      throw new Error("some internal database connection string leaked here");
    });

    const response = await handler(new Request("http://localhost/api/customers"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("database connection string");
  });

  it("sets Cache-Control: no-store on an error response", async () => {
    const handler = withApiHandler<[Request]>(async () => {
      throw new ApiError("UNAUTHENTICATED", "Authentication required.");
    });

    const response = await handler(new Request("http://localhost/api/customers"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sets Cache-Control: no-store on a successful response returned by the handler", async () => {
    const handler = withApiHandler<[Request]>(async () => NextResponse.json({ data: { ok: true } }, { status: 200 }));

    const response = await handler(new Request("http://localhost/api/customers"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { ok: true } });
  });

  it("passes through arbitrary handler arguments (e.g. dynamic route context)", async () => {
    const handler = withApiHandler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
      const { id } = await context.params;
      return NextResponse.json({ data: { id } }, { status: 200 });
    });

    const response = await handler(
      new Request("http://localhost/api/customers/abc"),
      { params: Promise.resolve({ id: "abc" }) },
    );

    expect(await response.json()).toEqual({ data: { id: "abc" } });
  });
});

describe("parsePagination", () => {
  it("defaults to page 1 and a reasonable non-empty pageSize (<= 50) when neither param is provided", () => {
    const result = parsePagination(new URLSearchParams());

    expect(result.page).toBe(1);
    expect(result.pageSize).toBeGreaterThan(0);
    expect(result.pageSize).toBeLessThanOrEqual(50);
  });

  it("parses valid explicit page and pageSize values", () => {
    const result = parsePagination(new URLSearchParams({ page: "3", pageSize: "10" }));

    expect(result).toEqual({ page: 3, pageSize: 10 });
  });

  it("rejects pageSize above 50 with a VALIDATION_ERROR ApiError", () => {
    expect(() => parsePagination(new URLSearchParams({ pageSize: "51" }))).toThrow(ApiError);
    try {
      parsePagination(new URLSearchParams({ pageSize: "51" }));
      throw new Error("expected parsePagination to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    }
  });

  it("rejects page below 1 with a VALIDATION_ERROR ApiError", () => {
    expect(() => parsePagination(new URLSearchParams({ page: "0" }))).toThrow(ApiError);
  });

  it("rejects a non-numeric page value with a VALIDATION_ERROR ApiError", () => {
    expect(() => parsePagination(new URLSearchParams({ page: "abc" }))).toThrow(ApiError);
  });

  it("rejects a non-numeric pageSize value with a VALIDATION_ERROR ApiError", () => {
    expect(() => parsePagination(new URLSearchParams({ pageSize: "abc" }))).toThrow(ApiError);
  });
});
