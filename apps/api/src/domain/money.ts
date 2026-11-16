/**
 * Money is represented as integer minor units (paisa) everywhere in memory.
 * No floating-point arithmetic is ever performed on a monetary value.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

/** Parse a decimal string such as "650.00" into integer minor units. */
export function toMinor(decimal: string): number {
  const value = decimal.trim();
  if (!DECIMAL_PATTERN.test(value)) {
    if (/\.\d{3,}$/.test(value)) {
      throw new MoneyError("Money must have at most 2 decimal places.");
    }
    throw new MoneyError(`Invalid money value: ${decimal}`);
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number.parseInt(`${fraction}00`.slice(0, 2), 10);
  return Number.parseInt(whole, 10) * 100 + cents;
}

/** Render integer minor units as a fixed 2-decimal string. */
export function fromMinor(minor: number): string {
  if (!Number.isInteger(minor)) {
    throw new MoneyError("Money must be an integer number of minor units.");
  }
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  const whole = Math.trunc(absolute / 100);
  const cents = absolute % 100;
  return `${sign}${whole}.${cents.toString().padStart(2, "0")}`;
}

function assertMinor(value: number): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError("Money must be an integer number of minor units.");
  }
}

export function add(a: number, b: number): number {
  assertMinor(a);
  assertMinor(b);
  return a + b;
}

/** Multiply a minor-unit price by an integer quantity (no rounding needed). */
export function multiply(minor: number, quantity: number): number {
  assertMinor(minor);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError("Quantity must be a non-negative integer.");
  }
  return minor * quantity;
}

/** Display helper: "PKR 1,450.00" is handled by the UI; this stays simple. */
export function formatMoney(minor: number, currency: string): string {
  return `${currency} ${fromMinor(minor)}`;
}
