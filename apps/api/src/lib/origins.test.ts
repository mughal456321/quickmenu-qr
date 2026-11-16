import { describe, expect, it } from "vitest";
import { env } from "../config";
import { isAllowedOrigin } from "./origins";

describe("origin allow-list (NFR-S1)", () => {
  const [firstConfigured] = env.FRONTEND_ORIGIN.split(",").map((s) => s.trim());

  it("accepts every origin in FRONTEND_ORIGIN", () => {
    expect(isAllowedOrigin(firstConfigured)).toBe(true);
  });

  it("accepts a localhost dev port that next dev fell back to", () => {
    expect(isAllowedOrigin("http://localhost:3001")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3002")).toBe(true);
  });

  it("rejects a public origin that is not configured", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.example.com")).toBe(false);
  });

  it("treats a request without an Origin header as same-origin", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });
});
