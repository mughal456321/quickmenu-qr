import { createHash, createHmac, timingSafeEqual } from "crypto";

/** D-1: base64url(HMAC-SHA256(secret, orderId)). */
export function createTrackingToken(orderId: string, secret: string): string {
  return createHmac("sha256", secret).update(orderId).digest("base64url");
}

/** Only the SHA-256 hex digest is stored in the database (D-1). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Recompute and compare in constant time. */
export function verifyToken(
  orderId: string,
  token: string,
  secret: string
): boolean {
  return constantTimeEqual(createTrackingToken(orderId, secret), token);
}

/** Compare a presented token with the stored SHA-256 hash (constant time). */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  return constantTimeEqual(hashToken(token), storedHash);
}
