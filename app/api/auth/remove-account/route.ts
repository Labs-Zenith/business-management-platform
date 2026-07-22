import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/server/api-error";
import { checkOrigin } from "@/lib/server/origin-check";
import { loadStoreFromCookie, saveStoreToCookie } from "@/lib/mock/cookie-persistence";
import { repositories } from "@/lib/services/repositories";

/**
 * Part 1d — removes a device-saved account from `saved_accounts` (Part 1c's
 * `AuthPort.removeSavedAccount`). Mirrors `switch-account/route.ts` EXACTLY:
 * authorization is (1) `checkOrigin` (anti-CSRF) AND (2) possession of
 * `userId`'s entry in THIS request's own `saved_accounts` cookie — no prior
 * active session (`requireSession()`) is required, matching
 * `switch-account`'s Part B contract. When `userId` IS the currently-active
 * session, removing it ALSO ends that session (its `sb-*`/`session` cookie
 * is cleared) — see `AuthPort.removeSavedAccount`'s JSDoc
 * (`lib/services/ports.ts`) for the full contract. Removing a non-active
 * saved account leaves the current session untouched.
 *
 * `.strict()` rejects any unknown field.
 */
const removeAccountSchema = z.object({ userId: z.string().min(1) }).strict();

function errorResponse(error: ApiError): NextResponse {
  return NextResponse.json(error.toResponseBody(), {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(new ApiError("VALIDATION_ERROR", "Invalid JSON payload."));
  }

  const parsed = removeAccountSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(
      new ApiError("VALIDATION_ERROR", "Invalid request payload.", parsed.error.flatten())
    );
  }

  await loadStoreFromCookie();
  try {
    // No prior session is required — `checkOrigin` (anti-CSRF) plus the
    // possession check below together ARE the authorization for this
    // endpoint, matching `switch-account`'s Part B contract.
    checkOrigin(request);

    // THE authorization check for this endpoint: `userId` must already be
    // present in THIS request's own `saved_accounts` cookie.
    const savedAccounts = await repositories.auth.listSavedAccounts();
    const match = savedAccounts.find((account) => account.userId === parsed.data.userId);
    if (!match) {
      const response = errorResponse(
        new ApiError("VALIDATION_ERROR", "This account is not saved on this device.")
      );
      saveStoreToCookie(response);
      return response;
    }

    await repositories.auth.removeSavedAccount(parsed.data.userId);

    const response = NextResponse.json(
      { data: { ok: true } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
    saveStoreToCookie(response);
    return response;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("[remove-account] unexpected error", error);
    }
    const response = error instanceof ApiError
      ? errorResponse(error)
      : errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected error."));
    saveStoreToCookie(response);
    return response;
  }
}
