/**
 * Browser storage helpers. Every call is wrapped in try/catch because private
 * browsing modes and disabled storage must not break ordering (FR-29).
 */

const TRACKING_PREFIX = "qm:tracking:";
const STAFF_TOKEN_KEY = "qm:staff-token";
const CART_PREFIX = "qm:cart:";
const LANGUAGE_PREFIX = "qm:lang:";
const MENU_PATH_PREFIX = "qm:menu-path:";
const SOUND_KEY = "qm:kitchen-sound";

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

export function saveMenuPath(orderId: string, path: string): void {
  write(`${MENU_PATH_PREFIX}${orderId}`, path);
}

export function getMenuPath(orderId: string): string | null {
  return read(`${MENU_PATH_PREFIX}${orderId}`);
}

export function saveCart<T>(qrToken: string, cart: T): void {
  try {
    write(`${CART_PREFIX}${qrToken}`, JSON.stringify(cart));
  } catch {
    /* Circular or oversized state: keep the in-memory cart. */
  }
}

export function readCart<T>(qrToken: string): T | null {
  const raw = read(`${CART_PREFIX}${qrToken}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearSavedCart(qrToken: string): void {
  remove(`${CART_PREFIX}${qrToken}`);
}

export function getSavedLanguage(qrToken: string): string | null {
  return read(`${LANGUAGE_PREFIX}${qrToken}`);
}

export function saveLanguage(qrToken: string, language: string): void {
  write(`${LANGUAGE_PREFIX}${qrToken}`, language);
}

export function getSoundEnabled(): boolean {
  return read(SOUND_KEY) === "on";
}

export function saveSoundEnabled(enabled: boolean): void {
  write(SOUND_KEY, enabled ? "on" : "off");
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
