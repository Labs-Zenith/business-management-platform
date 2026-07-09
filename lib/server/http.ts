/**
 * Shared API route handler utilities, per `docs/api-spec.md`'s conventions
 * ("todos los endpoints privados deben responder con Cache-Control: no-store",
 * "los endpoints de listado deben usar paginacion con limite maximo") and
 * `openspec/changes/mocked-mvp-scaffold/design.md`'s "http.ts withApiHandler:
 * try/catch mapping, Cache-Control:no-store on all, page/pageSize parse
 * (min1 max50)" decision.
 */

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { loadStoreFromCookie, saveStoreToCookie } from "@/lib/mock/cookie-persistence";

/**
 * Wraps a Next.js Route Handler so that:
 * - any thrown `ApiError` is mapped to `{error:{code,message,details}}` with
 *   the error's status code;
 * - any other thrown value is mapped to a generic 500 `INTERNAL_ERROR`
 *   (never leaks internal error messages/stack traces to the client);
 * - `Cache-Control: no-store` is set on EVERY response it produces,
 *   including ones the wrapped handler already built and returned.
 *
 * Generic over the handler's argument tuple so it works for both
 * non-dynamic routes (`(request)`) and dynamic ones
 * (`(request, { params })`).
 */
export function withApiHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args): Promise<NextResponse> => {
    await loadStoreFromCookie();
    try {
      const response = await handler(...args);
      response.headers.set("Cache-Control", "no-store");
      saveStoreToCookie(response);
      return response;
    } catch (error) {
      if (!(error instanceof ApiError)) {
        console.error(error);
      }
      const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL_ERROR", "Unexpected error.");
      const response = NextResponse.json(apiError.toResponseBody(), {
        status: apiError.status,
        headers: { "Cache-Control": "no-store" },
      });
      saveStoreToCookie(response);
      return response;
    }
  };
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type Pagination = { page: number; pageSize: number };

/**
 * Parses `page`/`pageSize` query params per the shared list convention:
 * `page` >= 1 (default 1), `pageSize` <= 50 (default `DEFAULT_PAGE_SIZE`).
 * Throws a `VALIDATION_ERROR` `ApiError` for any present-but-invalid value
 * (non-numeric, non-integer, or out of range) — invalid values are rejected,
 * never silently clamped.
 */
export function parsePagination(searchParams: URLSearchParams): Pagination {
  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("pageSize");

  const page = parsePositiveIntParam(pageParam, "page", 1, { min: 1 });
  const pageSize = parsePositiveIntParam(pageSizeParam, "pageSize", DEFAULT_PAGE_SIZE, {
    min: 1,
    max: MAX_PAGE_SIZE,
  });

  return { page, pageSize };
}

function parsePositiveIntParam(
  raw: string | null,
  name: string,
  defaultValue: number,
  bounds: { min: number; max?: number },
): number {
  if (raw === null) {
    return defaultValue;
  }

  const value = Number(raw);
  const isValid =
    Number.isInteger(value) && value >= bounds.min && (bounds.max === undefined || value <= bounds.max);

  if (!isValid) {
    throw new ApiError("VALIDATION_ERROR", `Invalid "${name}" query parameter.`, { [name]: raw });
  }

  return value;
}
