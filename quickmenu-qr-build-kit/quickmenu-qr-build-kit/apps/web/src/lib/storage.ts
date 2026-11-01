/**
 * Browser storage helpers. Every call is wrapped in try/catch because private
 * browsing modes and disabled storage must not break ordering (FR-29).
 */

const TRACKING_PREFIX = "qm:tracking:";
const STAFF_TOKEN_KEY = "qm:staff-token";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* Storage may be blocked; ordering still works for this tab. */
  }
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* Ignore. */
  }
}

export function saveTrackingToken(orderId: string, token: string): void {
  write(`${TRACKING_PREFIX}${orderId}`, token);
}

export function getTrackingToken(orderId: string): string | null {
  return read(`${TRACKING_PREFIX}${orderId}`);
}

export function saveStaffToken(token: string): void {
  write(STAFF_TOKEN_KEY, token);
}

export function getStaffToken(): string | null {
  return read(STAFF_TOKEN_KEY);
}

export function clearStaffToken(): void {
  remove(STAFF_TOKEN_KEY);
}

/** Generate one idempotency key per order attempt (NFR-R5). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
