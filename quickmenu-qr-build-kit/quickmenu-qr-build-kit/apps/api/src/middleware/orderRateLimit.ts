import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { RateLimitedError } from "../errors";

/**
 * NFR-S8: 5 orders per minute per table and IP. The QR token identifies the
 * table; the body has already been parsed when this middleware runs.
 */
export function createOrderRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const body = req.body as { qrToken?: unknown } | undefined;
      const table = typeof body?.qrToken === "string" ? body.qrToken : "unknown";
      return `${req.ip ?? "unknown"}:${table}`;
    },
    handler: (_req, _res, next) => {
      next(new RateLimitedError());
    },
  });
}
