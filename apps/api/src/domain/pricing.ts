import {
  EmptyOrderError,
  ForeignItemError,
  InvalidQuantityError,
  InvalidVariantError,
  ItemUnavailableError,
  TooManyLinesError,
  type UnavailableItem,
} from "./errors";
import { add, multiply, toMinor } from "./money";

export const MAX_LINES = 30;
export const MAX_QUANTITY = 50;

export interface PricingVariant {
  id: string;
  name: string;
  price: string;
}

export interface PricingItem {
  id: string;
  name: string;
  restaurantId?: string;
  basePrice: string;
  isAvailable: boolean;
  variants: PricingVariant[];
}

export interface PricingMenu {
  restaurantId: string;
  items: PricingItem[];
}

export interface RequestLine {
  itemId: string;
  variantId?: string | null;
  quantity: number;
  specialInstructions?: string | null;
}

export interface PricedLine {
  itemId: string;
  variantId: string | null;
  itemName: string;
  variantName: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  specialInstructions: string | null;
}

export interface PricedOrder {
  lines: PricedLine[];
  totalMinor: number;
}

/**
 * Pure pricing engine. Inputs come from the database snapshot; client-supplied
 * prices are not part of the request at all. Same input -> same output.
 */
export function priceOrder(menu: PricingMenu, requestLines: RequestLine[]): PricedOrder {
  if (requestLines.length === 0) throw new EmptyOrderError();
  if (requestLines.length > MAX_LINES) throw new TooManyLinesError(requestLines.length);

  const itemsById = new Map(menu.items.map((item) => [item.id, item]));
  const unavailable = new Map<string, UnavailableItem>();
  const pricedLines: PricedLine[] = [];

  for (const line of requestLines) {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY
    ) {
      throw new InvalidQuantityError(line.itemId, line.quantity);
    }

    const item = itemsById.get(line.itemId);
    if (
      !item ||
      (item.restaurantId !== undefined && item.restaurantId !== menu.restaurantId)
    ) {
      throw new ForeignItemError(line.itemId);
    }

    if (!item.isAvailable) {
      unavailable.set(item.id, { itemId: item.id, name: item.name });
      continue;
    }

    let variantId: string | null = null;
    let variantName: string | null = null;
    let unitPriceMinor: number;

    if (item.variants.length > 0) {
      if (!line.variantId) {
        throw new InvalidVariantError(
          item.id,
          "A variant is required for this item."
        );
      }
      const variant = item.variants.find((candidate) => candidate.id === line.variantId);
      if (!variant) {
        throw new InvalidVariantError(
          item.id,
          "That variant does not belong to this item."
        );
      }
      variantId = variant.id;
      variantName = variant.name;
      unitPriceMinor = toMinor(variant.price);
    } else {
      if (line.variantId) {
        throw new InvalidVariantError(item.id, "This item has no variants.");
      }
      unitPriceMinor = toMinor(item.basePrice);
    }

    pricedLines.push({
      itemId: item.id,
      variantId,
      itemName: item.name,
      variantName,
      quantity: line.quantity,
      unitPriceMinor,
      lineTotalMinor: multiply(unitPriceMinor, line.quantity),
      specialInstructions: line.specialInstructions ?? null,
    });
  }

  if (unavailable.size > 0) {
    throw new ItemUnavailableError([...unavailable.values()]);
  }

  const totalMinor = pricedLines.reduce(
    (total, line) => add(total, line.lineTotalMinor),
    0
  );
  return { lines: pricedLines, totalMinor };
}
