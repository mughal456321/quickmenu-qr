import { describe, expect, it } from "vitest";
import {
  EmptyOrderError,
  ForeignItemError,
  InvalidQuantityError,
  InvalidVariantError,
  ItemUnavailableError,
  TooManyLinesError,
} from "./errors";
import { fromMinor } from "./money";
import {
  MAX_LINES,
  priceOrder,
  type PricingItem,
  type PricingMenu,
  type RequestLine,
} from "./pricing";

const MENU: PricingMenu = {
  restaurantId: "r1",
  items: [
    {
      id: "i-biryani",
      name: "Chicken Biryani",
      restaurantId: "r1",
      basePrice: "500.00",
      isAvailable: true,
      variants: [
        { id: "v-regular", name: "Regular", price: "550.00" },
        { id: "v-large", name: "Large", price: "650.00" },
      ],
    },
    {
      id: "i-lemonade",
      name: "Mint Lemonade",
      basePrice: "150.00",
      restaurantId: "r1",
      isAvailable: true,
      variants: [],
    },
    {
      id: "i-naan",
      name: "Garlic Naan",
      basePrice: "80.00",
      restaurantId: "r1",
      isAvailable: true,
      variants: [],
    },
    {
      id: "i-soldout",
      name: "Daal Makhni",
      basePrice: "450.00",
      restaurantId: "r1",
      isAvailable: false,
      variants: [],
    },
  ],
};

function line(overrides: Partial<RequestLine> & { itemId: string }): RequestLine {
  return { quantity: 1, variantId: null, ...overrides };
}

describe("priceOrder (FR-25, FR-27, D-5)", () => {
  it("prices items with variants and snapshots names and unit prices", () => {
    const result = priceOrder(MENU, [
      line({ itemId: "i-biryani", variantId: "v-large", quantity: 2 }),
      line({ itemId: "i-lemonade", quantity: 1 }),
    ]);

    expect(result.lines).toEqual([
      {
        itemId: "i-biryani",
        variantId: "v-large",
        itemName: "Chicken Biryani",
        variantName: "Large",
        quantity: 2,
        unitPriceMinor: 65000,
        lineTotalMinor: 130000,
        specialInstructions: null,
      },
      {
        itemId: "i-lemonade",
        variantId: null,
        itemName: "Mint Lemonade",
        variantName: null,
        quantity: 1,
        unitPriceMinor: 15000,
        lineTotalMinor: 15000,
        specialInstructions: null,
      },
    ]);
    expect(result.totalMinor).toBe(145000);
    expect(fromMinor(result.totalMinor)).toBe("1450.00");
  });

  it("uses base_price when the item has no variants", () => {
    const result = priceOrder(MENU, [line({ itemId: "i-naan", quantity: 3 })]);
    expect(result.lines[0]?.unitPriceMinor).toBe(8000);
    expect(result.totalMinor).toBe(24000);
  });

  it("keeps special instructions on the priced line", () => {
    const result = priceOrder(MENU, [
      line({ itemId: "i-lemonade", specialInstructions: "no ice" }),
    ]);
    expect(result.lines[0]?.specialInstructions).toBe("no ice");
  });

  it("is deterministic for the same input", () => {
    const request = [line({ itemId: "i-biryani", variantId: "v-regular", quantity: 4 })];
    expect(priceOrder(MENU, request)).toEqual(priceOrder(MENU, request));
  });

  it("ignores any client-supplied price fields", () => {
    const tampered = {
      ...line({ itemId: "i-lemonade" }),
      unitPrice: 1,
      price: 1,
      total: 1,
    } as RequestLine;
    expect(priceOrder(MENU, [tampered]).totalMinor).toBe(15000);
  });

  it("throws EmptyOrderError for an empty cart", () => {
    expect(() => priceOrder(MENU, [])).toThrow(EmptyOrderError);
  });

  it("throws TooManyLinesError for more than 30 lines", () => {
    const lines = Array.from({ length: MAX_LINES + 1 }, () =>
      line({ itemId: "i-naan" })
    );
    expect(() => priceOrder(MENU, lines)).toThrow(TooManyLinesError);
  });

  it("accepts exactly 30 lines", () => {
    const lines = Array.from({ length: MAX_LINES }, () => line({ itemId: "i-naan" }));
    expect(priceOrder(MENU, lines).lines).toHaveLength(MAX_LINES);
  });

  it.each([0, -1, 51, 1.5, Number.NaN])(
    "throws InvalidQuantityError for quantity %s",
    (quantity) => {
      expect(() =>
        priceOrder(MENU, [line({ itemId: "i-naan", quantity })])
      ).toThrow(InvalidQuantityError);
    }
  );

  it("accepts the boundary quantities 1 and 50", () => {
    expect(priceOrder(MENU, [line({ itemId: "i-naan", quantity: 1 })]).totalMinor).toBe(8000);
    expect(priceOrder(MENU, [line({ itemId: "i-naan", quantity: 50 })]).totalMinor).toBe(400000);
  });

  it("requires a variant when the item has variants", () => {
    expect(() => priceOrder(MENU, [line({ itemId: "i-biryani" })])).toThrow(
      InvalidVariantError
    );
  });

  it("rejects a variant that belongs to another item", () => {
    expect(() =>
      priceOrder(MENU, [line({ itemId: "i-biryani", variantId: "v-unknown" })])
    ).toThrow(InvalidVariantError);
  });

  it("rejects a variant when the item has none", () => {
    expect(() =>
      priceOrder(MENU, [line({ itemId: "i-lemonade", variantId: "v-large" })])
    ).toThrow(InvalidVariantError);
  });

  it("rejects an item from another restaurant as ForeignItemError", () => {
    const foreign: PricingItem = {
      id: "i-foreign",
      name: "Foreign Dish",
      restaurantId: "r2",
      basePrice: "100.00",
      isAvailable: true,
      variants: [],
    };
    expect(() =>
      priceOrder({ restaurantId: "r1", items: [...MENU.items, foreign] }, [
        line({ itemId: "i-foreign" }),
      ])
    ).toThrow(ForeignItemError);
  });

  it("rejects an unknown item id", () => {
    expect(() => priceOrder(MENU, [line({ itemId: "missing" })])).toThrow(
      ForeignItemError
    );
  });

  it("lists every unavailable item, not just the first", () => {
    const menu: PricingMenu = {
      restaurantId: "r1",
      items: [
        ...MENU.items,
        {
          id: "i-soldout-2",
          name: "Mango Lassi",
          restaurantId: "r1",
          basePrice: "200.00",
          isAvailable: false,
          variants: [],
        },
      ],
    };
    try {
      priceOrder(menu, [
        line({ itemId: "i-soldout" }),
        line({ itemId: "i-soldout-2" }),
      ]);
      expect.unreachable("Expected ItemUnavailableError");
    } catch (error) {
      expect(error).toBeInstanceOf(ItemUnavailableError);
      expect((error as ItemUnavailableError).items).toEqual([
        { itemId: "i-soldout", name: "Daal Makhni" },
        { itemId: "i-soldout-2", name: "Mango Lassi" },
      ]);
    }
  });
});
