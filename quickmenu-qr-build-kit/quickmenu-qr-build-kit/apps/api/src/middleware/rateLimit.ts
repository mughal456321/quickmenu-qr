import rateLimit from "express-rate-limit";
import { env } from "../config";

/**
 * NFR-S8 / docs/03 3.2: login is limited to 10 requests per minute per IP.
 * Disabled under NODE_ENV=test so lockout tests can exercise the DB logic; the
 * global 100/min limiter still guards every route.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts." } },
});
