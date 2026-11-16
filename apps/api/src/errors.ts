/**
 * Framework-agnostic application errors.
 *
 * `AppError` carries the documented error code, HTTP status, a safe message for
 * the client, and optional details. Nothing in the message may reveal SQL,
 * stack traces, or other internals.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Backwards-compatible wrapper used by the phase 03 code. It maps onto the same
 * shape as `AppError` so the central handler only needs one branch.
 */
export class ApiError extends AppError {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(code, statusCode, message, details);
  }

  get statusCode(): number {
    return this.httpStatus;
  }
}

/* Documented error subclasses (docs/03 section 3.3). */

export class ValidationError extends AppError {
  constructor(
    message = "One or more fields are invalid.",
    details?: Array<{ field: string; issue: string }>
  ) {
    super("VALIDATION_ERROR", 400, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHENTICATED", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super("NOT_FOUND", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "A resource with that value already exists.") {
    super("CONFLICT", 409, message);
  }
}

export class ItemUnavailableAppError extends AppError {
  constructor(details: Array<{ itemId: string; name: string }>) {
    super("ITEM_UNAVAILABLE", 409, "One or more items are unavailable.", details);
  }
}

export class InvalidStatusTransitionAppError extends AppError {
  constructor(message = "That status change is not allowed.") {
    super("INVALID_STATUS_TRANSITION", 409, message);
  }
}

export class TableInactiveError extends AppError {
  constructor(message = "This table is not available for ordering.") {
    super("TABLE_INACTIVE", 422, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Please wait and try again.") {
    super("RATE_LIMITED", 429, message);
  }
}

export class InternalError extends AppError {
  constructor() {
    super("INTERNAL_ERROR", 500, "Internal server error.");
  }
}

export function formatError(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown
) {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId,
    },
  };
}
