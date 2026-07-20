import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/server/api-error";
import { checkOrigin } from "@/lib/server/origin-check";
import { loadStoreFromCookie, saveStoreToCookie } from "@/lib/mock/cookie-persistence";
import { repositories } from "@/lib/services/repositories";

/**
 * Part B — activates a saved account's session WITHOUT requiring a prior
 * active session. Authorization is no longer "must already be logged in";
 * it is: (1) `checkOrigin` (anti-CSRF — the request must come from this
 * app's own origin) AND (2) possession of `userId`'s entry in THIS
 * request's own `saved_accounts` cookie (httpOnly, and — since Part C1 —
 * AES-256-GCM encrypted; see `lib/server/cookie-crypto.ts`). Possessing that
 * cookie's stored refresh token is already equivalent to being able to log
 * in as that account, so requiring an UNRELATED separate active session on
 * top of it added no real security — it only broke the "open a new tab,
 * pick a saved profile" flow. See `AuthPort.switchAccount`'s JSDoc
 * (`lib/services/ports.ts`) for the full contract.
 *
 * `.strict()` rejects any unknown field — in particular, this endpoint MUST
 * NEVER accept a client-supplied refresh token or any other credential: the
 * ONLY thing the client sends is which already-saved account to activate.
 */
const switchAccountSchema = z.object({ userId: z.string().min(1) }).strict();

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

  const parsed = switchAccountSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(
      new ApiError("VALIDATION_ERROR", "Invalid request payload.", parsed.error.flatten())
    );
  }

  await loadStoreFromCookie();
  try {
    // No prior session is required (Part B) — `checkOrigin` (anti-CSRF)
    // plus the possession check below together ARE the authorization for
    // this endpoint. `middleware.ts` does not guard `/api/auth/*` (same
    // precedent as login/logout/switch-business), so this route enforces
    // its own checks.
    checkOrigin(request);

    // THE authorization check for this endpoint: `userId` must already be
    // present in THIS request's own `saved_accounts` cookie — the presence
    // of its stored (server-side, httpOnly, encrypted — see
    // `lib/server/cookie-crypto.ts`) refresh token IS the authorization. A
    // client can never supply or forge one; it can only pick among accounts
    // this device already has saved.
    const savedAccounts = await repositories.auth.listSavedAccounts();
    const match = savedAccounts.find((account) => account.userId === parsed.data.userId);
    if (!match) {
      const response = errorResponse(
        new ApiError("VALIDATION_ERROR", "This account is not saved on this device.")
      );
      saveStoreToCookie(response);
      return response;
    }

    const session = await repositories.auth.switchAccount(parsed.data.userId);
    if (!session) {
      // The account was saved but its stored token turned out to be
      // stale/invalid (or its membership disappeared) — the adapter has
      // already dropped it from `saved_accounts`; this account now
      // requires a fresh login.
      const response = errorResponse(
        new ApiError("UNAUTHENTICATED", "Could not switch to that account. Please sign in again.")
      );
      saveStoreToCookie(response);
      return response;
    }

    const response = NextResponse.json(
      { data: { session } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
    saveStoreToCookie(response);
    return response;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("[switch-account] unexpected error", error);
    }
    const response = error instanceof ApiError
      ? errorResponse(error)
      : errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected error."));
    saveStoreToCookie(response);
    return response;
  }
}
