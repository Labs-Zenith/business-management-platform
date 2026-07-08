/**
 * Uniform API error shape, per `docs/api-spec.md`:
 * `{ error: { code, message, details } }`.
 */

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const DEFAULT_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status ?? DEFAULT_STATUS_BY_CODE[code];
    this.details = details;
  }

  /** Body shape matching `docs/api-spec.md`'s `{error:{code,message,details}}`. */
  toResponseBody(): { error: { code: ApiErrorCode; message: string; details?: unknown } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}
