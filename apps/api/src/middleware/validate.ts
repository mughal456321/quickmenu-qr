import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../errors";

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  headers?: ZodTypeAny;
}

const PARTS = ["body", "query", "params", "headers"] as const;

/**
 * Validate every part of a request with zod before the controller runs.
 *
 * - Unknown fields are stripped by the zod object schemas.
 * - All failures are collected into the documented
 *   `details: [{ field, issue }]` shape.
 * - Parsed values replace `req.body`, `req.query` and `req.params`; parsed
 *   headers are merged so unrelated headers (auth, cookies) are preserved.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const details: Array<{ field: string; issue: string }> = [];

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({
            field: issue.path.join(".") || part,
            issue: issue.message,
          });
        }
        continue;
      }
      if (part === "headers") {
        Object.assign(req.headers, result.data as Record<string, unknown>);
      } else {
        req[part] = result.data as never;
      }
    }

    if (details.length > 0) {
      next(new ValidationError("One or more fields are invalid.", details));
      return;
    }
    next();
  };
}
