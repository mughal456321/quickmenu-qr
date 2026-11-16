import { describe, expect, it } from "vitest";
import type { PublicMenuItem } from "@quickmenu/shared";
import {
  addCartLine,
  applyAvailability,
  cartItemCount,
  cartTotalMinor,
  changeQuantity,
  removeCartLine,
  setLineInstructions,
} from "../cart";

const lemonade: PublicMenuItem = {
  id: "item-lemonade",
  name: "Mint Lemonade",
  description: null,
  price: 250,
  variants: [],
  images: [],
  dietaryTags: ["vegan"],
  allergens: [],
  isAvailable: true,
};

const biryani: PublicMenuItem = {
  id: "item-biryani",
  name: "Chicken Biryani",
  description: null,
  price: 450,
  variants: [
    { id: "variant-half", name: "Half", price: 450 },
    { id: "variant-full", name: "Full", price: 650 },
  ],
  images: [],
  dietaryTags: ["halal"],
  allergens: [],
  isAvailable: true,
};

describe("cart (FR-23..FR-25)", () => {
  it("merges the same item and variant into one line", () => {
    const first = addCartLine([], biryani, biryani.variants[1]!);
    const second = addCartLine(first, biryani, biryani.variants[1]!);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      itemId: biryani.id,
      variantId: "variant-full",
      quantity: 2,
      unitPrice: 650,
    });
  });

  it("keeps different variants as separate lines", () => {
    let lines = addCartLine([], biryani, biryani.variants[0]!);
    lines = addCartLine(lines, biryani, biryani.variants[1]!);
    expect(lines.map((line) => line.variantId)).toEqual([
      "variant-half",
      "variant-full",
    ]);
  });

  it("caps a line at 50 units", () => {
    const line = addCartLine([], lemonade, null, 50);
    const capped = addCartLine(line, lemonade, null, 5);
    expect(capped[0]!.quantity).toBe(50);
  });

  it("removes a line when the quantity drops below one", () => {
    const line = addCartLine([], lemonade, null, 2)[0]!;
    expect(changeQuantity([line], line.key, 0)).toEqual([]);
    expect(changeQuantity([line], line.key, -3)).toEqual([]);
  });

  it("counts units and total in minor units", () => {
    let lines = addCartLine([], biryani, biryani.variants[1]!);
    lines = addCartLine(lines, lemonade, null, 2);
    expect(cartItemCount(lines)).toBe(3);
    expect(cartTotalMinor(lines)).toBe(650 * 100 + 250 * 100 * 2);
  });

  it("stores per-line instructions and removes lines by key", () => {
    const line = addCartLine([], lemonade, null)[0]!;
    const instructed = setLineInstructions([line], line.key, "No ice");
    expect(instructed[0]!.instructions).toBe("No ice");
    expect(removeCartLine(instructed, line.key)).toEqual([]);
  });

  it("marks lines unavailable from menu:updated without losing the cart (FR-27)", () => {
    const line = addCartLine([], lemonade, null)[0]!;
    const updated = applyAvailability([line], lemonade.id, false);
    expect(updated[0]).toMatchObject({ isAvailable: false, quantity: 1 });
  });
});
