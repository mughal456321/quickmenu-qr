import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromMinor, toMinor } from "./money";
import { priceOrder, type PricingItem, type RequestLine } from "./pricing";

/** Build a menu where item i has a price derived from cents and an optional variant. */
function menuFor(pricesMinor: number[]) {
  const items: PricingItem[] = pricesMinor.map((minor, index) => ({
    id: `item-${index}`,
    name: `Item ${index}`,
    restaurantId: "r1",
    basePrice: fromMinor(minor),
    isAvailable: true,
    variants: [],
  }));
  return { restaurantId: "r1", items };
}

const quantity = fc.integer({ min: 1, max: 50 });
const priceMinor = fc.integer({ min: 0, max: 5_000_000 });

const cartArbitrary = fc
  .array(fc.tuple(priceMinor, quantity), { minLength: 1, maxLength: 30 })
  .map((rows) => ({
    menu: menuFor(rows.map(([minor]) => minor)),
    lines: rows.map(
      ([, qty], index): RequestLine => ({ itemId: `item-${index}`, quantity: qty })
    ),
    pricesMinor: rows.map(([minor]) => minor),
    quantities: rows.map(([, qty]) => qty),
  }));

describe("priceOrder properties (FR-25)", () => {
  it("total always equals the sum of the line totals", () => {
    fc.assert(
      fc.property(cartArbitrary, ({ menu, lines }) => {
        const result = priceOrder(menu, lines);
        const sum = result.lines.reduce((total, line) => total + line.lineTotalMinor, 0);
        expect(result.totalMinor).toBe(sum);
      }),
      { numRuns: 200 }
    );
  });

  it("total is never negative", () => {
    fc.assert(
      fc.property(cartArbitrary, ({ menu, lines }) => {
        expect(priceOrder(menu, lines).totalMinor).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 }
    );
  });

  it("line ordering never changes the total", () => {
    fc.assert(
      fc.property(cartArbitrary, ({ menu, lines }) => {
        const forward = priceOrder(menu, lines).totalMinor;
        const reversed = priceOrder(menu, [...lines].reverse()).totalMinor;
        expect(reversed).toBe(forward);
      }),
      { numRuns: 200 }
    );
  });

  it("computes each line total as unit price x quantity without drift", () => {
    fc.assert(
      fc.property(cartArbitrary, ({ menu, lines, pricesMinor, quantities }) => {
        const result = priceOrder(menu, lines);
        result.lines.forEach((line, index) => {
          expect(line.lineTotalMinor).toBe(
            pricesMinor[index]! * quantities[index]!
          );
        });
      }),
      { numRuns: 200 }
    );
  });

  it("3 x 0.10 is exactly 0.30 (no floating point drift)", () => {
    const menu = menuFor([toMinor("0.10")]);
    const result = priceOrder(menu, [{ itemId: "item-0", quantity: 3 }]);
    expect(result.totalMinor).toBe(30);
    expect(fromMinor(result.totalMinor)).toBe("0.30");
  });
});
