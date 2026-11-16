/** Typed, framework-free domain errors. The API maps them to AppError codes. */

export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface UnavailableItem {
  itemId: string;
  name: string;
}

/** Reports every unavailable item in the cart, not just the first. */
export class ItemUnavailableError extends DomainError {
  readonly code = "ITEM_UNAVAILABLE";

  constructor(public readonly items: UnavailableItem[]) {
    super("One or more items are unavailable.");
  }
}

export class InvalidVariantError extends DomainError {
  readonly code = "INVALID_VARIANT";

  constructor(
    public readonly itemId: string,
    message = "The selected variant is not valid for this item."
  ) {
    super(message);
  }
}

export class InvalidQuantityError extends DomainError {
  readonly code = "INVALID_QUANTITY";

  constructor(
    public readonly itemId: string,
    public readonly quantity: number
  ) {
    super("Quantity must be a whole number between 1 and 50.");
  }
}

export class EmptyOrderError extends DomainError {
  readonly code = "EMPTY_ORDER";

  constructor() {
    super("An order must contain at least one line.");
  }
}

export class TooManyLinesError extends DomainError {
  readonly code = "TOO_MANY_LINES";

  constructor(public readonly count: number) {
    super("An order can have at most 30 lines.");
  }
}

export class ForeignItemError extends DomainError {
  readonly code = "FOREIGN_ITEM";

  constructor(public readonly itemId: string) {
    super("An item does not belong to this restaurant.");
  }
}
