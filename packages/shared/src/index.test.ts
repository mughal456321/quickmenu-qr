import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  userRoleSchema,
  orderStatusSchema,
  SUPPORTED_LANGUAGES,
  ALLOWED_DIETARY_TAGS,
  ALLOWED_ALLERGENS,
} from "./index";

describe("Phase 01 shared package", () => {
  it("exports enums", () => {
    expect(userRoleSchema.parse("owner")).toBe("owner");
    expect(orderStatusSchema.parse("served")).toBe("served");
  });

  it("lists at least 5 supported languages", () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(5);
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(
      expect.arrayContaining(["en", "ur", "ar", "zh", "fr"])
    );
  });

  it("exports the documented tag and allergen sets", () => {
    expect([...ALLOWED_DIETARY_TAGS]).toEqual([
      "vegetarian",
      "vegan",
      "halal",
      "gluten_free",
    ]);
    expect([...ALLOWED_ALLERGENS]).toEqual([
      "nuts",
      "dairy",
      "gluten",
      "eggs",
      "seafood",
      "soy",
    ]);
  });

  it("rejects invalid enum values", () => {
    expect(() => userRoleSchema.parse("admin")).toThrow(z.ZodError);
    expect(() => orderStatusSchema.parse("bogus")).toThrow(z.ZodError);
  });
});