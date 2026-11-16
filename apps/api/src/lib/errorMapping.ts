import {
  AppError,
  ConflictError,
  ItemUnavailableAppError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "../errors";
import {
  DomainError,
  ForeignItemError,
  InvalidQuantityError,
  InvalidVariantError,
  ItemUnavailableError,
  TooManyLinesError,
  EmptyOrderError,
} from "../domain/errors";

interface PostgresErrorLike {
  code?: string;
  constraint?: string;
  detail?: string;
  type?: string;
}

function asPostgresError(err: unknown): PostgresErrorLike | null {
  if (err && typeof err === "object" && "code" in err) {
    return err as PostgresErrorLike;
  }
  return null;
}

/**
 * Translate a pure domain error into the documented API error. Every branch
 * returns a message that is safe to show to a customer.
 */
export function mapDomainError(error: DomainError): AppError {
  if (error instanceof ItemUnavailableError) {
    return new ItemUnavailableAppError(error.items);
  }
  if (error instanceof InvalidVariantError) {
    return new ValidationError("One or more items are invalid.", [
      { field: "items.variantId", issue: error.message },
    ]);
  }
  if (error instanceof InvalidQuantityError) {
    return new ValidationError("One or more fields are invalid.", [
      {
        field: "items.quantity",
        issue: "Quantity must be a whole number between 1 and 50.",
      },
    ]);
  }
  if (error instanceof EmptyOrderError) {
    return new ValidationError("The cart is empty.", [
      { field: "items", issue: "At least one item is required." },
    ]);
  }
  if (error instanceof TooManyLinesError) {
    return new ValidationError("Too many order lines.", [
      { field: "items", issue: "An order can have at most 30 lines." },
    ]);
  }
  if (error instanceof ForeignItemError) {
    // Never reveal that another restaurant owns the item (NFR-S6).
    return new NotFoundError("One or more items were not found.");
  }
  return new ValidationError(error.message);
}

/**
 * Convert database errors into documented API errors. The original database
 * message is never forwarded to the client.
 */
export function mapPostgresError(err: unknown): AppError | null {
  const pg = asPostgresError(err);
  if (!pg || !pg.code) return null;

  switch (pg.code) {
    case "23505": // unique_violation
      return new ConflictError("A resource with that value already exists.");
    case "23503": // foreign_key_violation
      return new ConflictError("Operation blocked by a related resource.");
    case "23514": // check_violation
    case "23502": // not_null_violation
    case "22P02": // invalid_text_representation (e.g. malformed UUID)
    case "22003": // numeric_value_out_of_range
      return new ValidationError();
    case "40001": // serialization_failure
    case "40P01": // deadlock_detected: safe to retry
      return new ConflictError("The request conflicted with another change. Please retry.");
    default:
      return null;
  }
}

/** Body-parser (express.json) failures are not errors we control. */
export function mapBodyParserError(err: unknown): AppError | null {
  const candidate = err as PostgresErrorLike | null;
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.type === "entity.too.large") {
    return new AppError("PAYLOAD_TOO_LARGE", 413, "The request body is too large.");
  }
  if (candidate.type === "entity.parse.failed") {
    return new ValidationError("The request body is not valid JSON.", [
      { field: "body", issue: "Malformed JSON." },
    ]);
  }
  return null;
}

export type MappableError = unknown;

/** Single entry point used by the central error middleware. */
export function mapError(err: MappableError): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof DomainError) return mapDomainError(err);
  const bodyParser = mapBodyParserError(err);
  if (bodyParser) return bodyParser;
  const pg = mapPostgresError(err);
  if (pg) return pg;
  return new InternalError();
}
