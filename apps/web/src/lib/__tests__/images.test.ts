import { describe, expect, it } from "vitest";
import { optimizedImageUrl } from "../images";

describe("image delivery (NFR-P5)", () => {
  it("adds auto format, quality and a width to Cloudinary URLs", () => {
    expect(
      optimizedImageUrl(
        "https://res.cloudinary.com/demo/image/upload/quickmenu/r1/dish.jpg",
        800
      )
    ).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800/quickmenu/r1/dish.jpg"
    );
  });

  it("does not stack transformations", () => {
    const url =
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400/quickmenu/r1/dish.jpg";
    expect(optimizedImageUrl(url)).toBe(url);
  });

  it("leaves non-Cloudinary URLs alone", () => {
    expect(optimizedImageUrl("https://example.com/dish.jpg")).toBe(
      "https://example.com/dish.jpg"
    );
    expect(optimizedImageUrl("/local/dish.jpg")).toBe("/local/dish.jpg");
  });
});
