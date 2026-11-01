import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  createTrackingToken,
  hashToken,
  verifyToken,
  verifyTokenHash,
} from "./tracking";

const SECRET = "test-tracking-secret-at-least-32-chars-long";

describe("tracking token (FR-29, D-1)", () => {
  it("round-trips the HMAC token for an order id", () => {
    const orderId = randomUUID();
    const token = createTrackingToken(orderId, SECRET);
    expect(verifyToken(orderId, token, SECRET)).toBe(true);
  });

  it("is deterministic so an idempotent replay returns the same token", () => {
    const orderId = randomUUID();
    expect(createTrackingToken(orderId, SECRET)).toBe(
      createTrackingToken(orderId, SECRET)
    );
  });

  it("produces a URL-safe base64url string", () => {
    const token = createTrackingToken(randomUUID(), SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects a token for a different order", () => {
    const token = createTrackingToken(randomUUID(), SECRET);
    expect(verifyToken(randomUUID(), token, SECRET)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const orderId = randomUUID();
    const token = createTrackingToken(orderId, SECRET);
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(verifyToken(orderId, tampered, SECRET)).toBe(false);
  });

  it("rejects a token made with a different secret", () => {
    const orderId = randomUUID();
    const token = createTrackingToken(orderId, `${SECRET}-other`);
    expect(verifyToken(orderId, token, SECRET)).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    expect(verifyToken(randomUUID(), "short", SECRET)).toBe(false);
    expect(verifyToken(randomUUID(), "", SECRET)).toBe(false);
  });

  it("hashes tokens as a stable 64-character SHA-256 hex digest", () => {
    const token = createTrackingToken(randomUUID(), SECRET);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("verifies a presented token against the stored hash in constant time", () => {
    const token = createTrackingToken(randomUUID(), SECRET);
    expect(verifyTokenHash(token, hashToken(token))).toBe(true);
    expect(verifyTokenHash(`${token}x`, hashToken(token))).toBe(false);
    expect(verifyTokenHash(token, "a".repeat(64))).toBe(false);
  });
});
