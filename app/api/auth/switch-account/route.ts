import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/server/api-error";
import { checkOrigin } from "@/lib/server/origin-check";
import { loadStoreFromCookie, saveStoreToCookie } from "@/lib/mock/cookie-persistence";
import { requireSession } from "@/lib/session";
import { repositories } from "@/lib/services/repositories";

/**
 * `.strict()` rejects any unknown field — in particular, this endpoint MUST
 * NEVER accept a client-supplied refresh token or any other credential: the
 * ONLY thing the client sends is which already-saved account to activate.
 * See `AuthPort.switchAccount`'s security contract (`lib/services/ports.ts`).
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
    // Defense in depth: only an already-authenticated request may switch
    // accounts. `middleware.ts` does not guard `/api/auth/*` (same
    // precedent as login/logout/switch-business), so this route enforces
    // the session requirement itself.
    await requireSession();
    checkOrigin(request);

    // THE authorization check for this endpoint: `userId` must already be
    // present in THIS request's own `saved_accounts` cookie — the presence
    // of its stored (server-side, httpOnly) refresh token IS the
    // authorization. A client can never supply or forge one; it can only
    // pick among accounts this device already has saved.
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
