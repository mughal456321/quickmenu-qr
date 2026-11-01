import { describe, expect, it } from "vitest";
import { decideOnReplay } from "./idempotency";

describe("decideOnReplay (NFR-R5)", () => {
  it("creates a new order when the key is unknown", () => {
    expect(decideOnReplay(null)).toBe("create");
  });

  it("returns the existing order for a known key", () => {
    expect(decideOnReplay({ id: "order-1" })).toBe("return-existing");
    expect(decideOnReplay({ id: "order-1" })).not.toBe("create");
  });
});
