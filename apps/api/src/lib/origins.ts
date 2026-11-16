import { env } from "../config";

const configuredOrigins = new Set(
  env.FRONTEND_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
);

/**
 * Any `http://localhost:<port>` or `http://127.0.0.1:<port>`.
 *
 * `next dev` moves to the next free port when 3000 is busy. Without this a
 * developer landing on 3001 gets an opaque network error on every request
 * instead of a working app. Production keeps the strict allow-list only.
 */
const localDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (configuredOrigins.has(origin)) return true;
  return env.NODE_ENV !== "production" && localDevOrigin.test(origin);
}
