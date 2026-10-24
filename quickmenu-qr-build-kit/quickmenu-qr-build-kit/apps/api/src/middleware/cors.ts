import { Request, Response, NextFunction } from "express";
import { env } from "../config";

const ALLOWED_ORIGINS = new Set(
  env.FRONTEND_ORIGIN.split(",").map((s) => s.trim())
);

export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,Idempotency-Key,X-Tracking-Token"
  );
  res.set("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}