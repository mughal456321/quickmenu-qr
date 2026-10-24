import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError, formatError } from "../errors";
import { env } from "../config";

function isPostgresError(err: unknown): { code?: string } | null {
  if (err && typeof err === "object" && "code" in err) {
    return err as { code?: string };
  }
  return null;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json(
      formatError(err.statusCode, err.code, err.message, req.id, err.details)
    );
    return;
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({
      field: i.path.join("."),
      issue: i.message,
    }));
    res.status(400).json(
      formatError(400, "VALIDATION_ERROR", "One or more fields are invalid.", req.id, details)
    );
    return;
  }
  const pg = isPostgresError(err);
  if (pg && pg.code) {
    switch (pg.code) {
      case "23505": // unique_violation
        res.status(409).json(
          formatError(409, "CONFLICT", "A resource with that value already exists.", req.id)
        );
        return;
      case "23503": // foreign_key_violation
        res.status(409).json(
          formatError(409, "CONFLICT", "Operation blocked by a related resource.", req.id)
        );
        return;
      case "23514": // check_violation
        res.status(400).json(
          formatError(400, "VALIDATION_ERROR", "One or more fields are invalid.", req.id)
        );
        return;
    }
  }
  const message =
    env.NODE_ENV === "production" ? "Internal server error" : (err as Error).message;
  res.status(500).json(formatError(500, "INTERNAL_ERROR", message, req.id));
}