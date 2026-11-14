import { describe, expect, it } from "vitest";
import type { PublicMenuItem } from "@quickmenu/shared";
import { buildMenuQuery, priceRange, toggleFilterValue } from "../menuFilters";

const item: PublicMenuItem = {
  id: "item-1",
  name: "Chicken Biryani",
  description: null,
  price: 450,
  variants: [],
  images: [],
  dietaryTags: ["halal"],
  allergens: ["nuts"],
  isAvailable: true,
};

describe("public menu filters (FR-19..FR-22)", () => {
  it("builds a stable, sorted query string", () => {
    const query = buildMenuQuery({
      lang: "ur",
      dietary: ["vegan", "halal"],
      exclude: ["nuts", "dairy"],
      q: "  biryani  ",
    });
    expect(query).toBe("?lang=ur&dietary=halal%2Cvegan&exclude=dairy%2Cnuts&q=biryani");
  });

  it("omits empty filters so the API uses its defaults", () => {
    expect(buildMenuQuery({})).toBe("");
    expect(buildMenuQuery({ dietary: [], exclude: [], q: "   " })).toBe("");
  });

  it("toggles a filter value on and off", () => {
    const once = toggleFilterValue([], "halal");
    expect(once).toEqual(["halal"]);
    expect(toggleFilterValue(once, "halal")).toEqual([]);
  });

  it("uses the base price when there are no variants", () => {
    expect(priceRange(item)).toEqual({ min: 450, max: 450 });
  });

  it("shows the lowest and highest variant price", () => {
    const withVariants: PublicMenuItem = {
      ...item,
      variants: [
        { id: "v1", name: "Half", price: 450 },
        { id: "v2", name: "Full", price: 650 },
      ],
    };
    expect(priceRange(withVariants)).toEqual({ min: 450, max: 650 });
  });
});
