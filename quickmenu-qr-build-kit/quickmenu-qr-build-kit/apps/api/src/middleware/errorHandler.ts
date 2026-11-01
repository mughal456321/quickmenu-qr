import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, ValidationError, formatError } from "../errors";
import { mapError } from "../lib/errorMapping";
import { logger } from "../logger";

function zodToValidationError(error: ZodError): ValidationError {
  return new ValidationError(
    "One or more fields are invalid.",
    error.issues.map((issue) => ({
      field: issue.path.join("."),
      issue: issue.message,
    }))
  );
}

/**
 * The single exit point for every failure.
 *
 * - Known application/domain/database errors keep their documented code.
 * - Validation errors include a `details` list.
 * - Anything unexpected becomes `INTERNAL_ERROR` with a generic message; the
 *   stack is logged with the request id but never sent to the client.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError =
    err instanceof ZodError ? zodToValidationError(err) : mapError(err);

  if (appError.httpStatus >= 500) {
    logger.error(
      {
        requestId: req.id,
        method: req.method,
        path: req.path,
        err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      },
      "unhandled error"
    );
  }

  const safe: AppError = appError;
  res
    .status(safe.httpStatus)
    .json(formatError(safe.httpStatus, safe.code, safe.message, req.id, safe.details));
}
