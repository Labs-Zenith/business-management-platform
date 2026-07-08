import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";

/**
 * `.strict()` rejects any unknown field — including a client-supplied
 * `businessId`/`business_id` — per `docs/security-plan.md`'s "rechazo de
 * campos desconocidos sensibles" rule.
 */
const loginSchema = z
  .object({
    email: z.string().trim().min(1).email(),
    password: z.string().min(1),
  })
  .strict();

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

  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(
      new ApiError("VALIDATION_ERROR", "Invalid email or password format.", parsed.error.flatten())
    );
  }

  try {
    // Intentionally does NOT call requireSession() — establishing a new
    // session is the whole purpose of this endpoint, so it must be
    // reachable without one. `signIn` sets the httpOnly cookie itself.
    const session = await repositories.auth.signIn(parsed.data.email, parsed.data.password);
    if (!session) {
      // Generic message: never reveal whether the email or the password
      // was wrong, per the mock-auth-session spec's "Incorrect credentials"
      // scenario.
      return errorResponse(new ApiError("UNAUTHENTICATED", "Invalid email or password."));
    }

    return NextResponse.json(
      { data: { session } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error);
    }
    return errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected error."));
  }
}
