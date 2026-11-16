import type { PublicMenuItem, PublicMenuVariant } from "@quickmenu/shared";

/** One line in the customer cart (FR-23..FR-25). */
export interface CartLine {
  key: string;
  itemId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  instructions: string;
  isAvailable: boolean;
}

export interface PersistedCart {
  lines: CartLine[];
  notes: string;
}

export const MAX_LINE_QUANTITY = 50;

export function cartKey(itemId: string, variantId: string | null): string {
  return `${itemId}:${variantId ?? "base"}`;
}

export function addCartLine(
  lines: CartLine[],
  item: PublicMenuItem,
  variant: PublicMenuVariant | null,
  quantity = 1
): CartLine[] {
  const key = cartKey(item.id, variant?.id ?? null);
  const existing = lines.find((line) => line.key === key);
  if (existing) {
    return lines.map((line) =>
      line.key === key
        ? {
            ...line,
            quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + quantity),
          }
        : line
    );
  }
  return [
    ...lines,
    {
      key,
      itemId: item.id,
      variantId: variant?.id ?? null,
      name: item.name,
      variantName: variant?.name ?? null,
      unitPrice: variant?.price ?? item.price,
      quantity: Math.min(MAX_LINE_QUANTITY, quantity),
      instructions: "",
      isAvailable: item.isAvailable,
    },
  ];
}

export function changeQuantity(
  lines: CartLine[],
  key: string,
  quantity: number
): CartLine[] {
  if (quantity < 1) return lines.filter((line) => line.key !== key);
  return lines.map((line) =>
    line.key === key
      ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }
      : line
  );
}

export function setLineInstructions(
  lines: CartLine[],
  key: string,
  instructions: string
): CartLine[] {
  return lines.map((line) =>
    line.key === key ? { ...line, instructions } : line
  );
}

export function removeCartLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => line.key !== key);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/** Display total in minor units (the server recalculates the real total). */
export function cartTotalMinor(lines: CartLine[]): number {
  return lines.reduce(
    (total, line) => total + Math.round(line.unitPrice * 100) * line.quantity,
    0
  );
}

/** Apply an availability change from `menu:updated` without losing the cart. */
export function applyAvailability(
  lines: CartLine[],
  itemId: string,
  isAvailable: boolean
): CartLine[] {
  return lines.map((line) =>
    line.itemId === itemId ? { ...line, isAvailable } : line
  );
}
