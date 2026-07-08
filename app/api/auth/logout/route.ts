import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { requireSession } from "@/lib/session";
import { repositories } from "@/lib/services/repositories";

function errorResponse(error: ApiError): NextResponse {
  return NextResponse.json(error.toResponseBody(), {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(): Promise<NextResponse> {
  try {
    // Defense in depth: only an already-authenticated request may log out.
    // `middleware.ts` does not guard `/api/auth/*`, so this route enforces
    // the session requirement itself.
    await requireSession();
    await repositories.auth.signOut();

    return NextResponse.json(
      { data: { success: true } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error);
    }
    return errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected error."));
  }
}
