import type { Request, Response } from "express";
import { env } from "../config";
import { REFRESH_COOKIE_NAME, REFRESH_TOKEN_TTL_SECONDS } from "./tokens";

/** Parse a Cookie header without adding a dependency. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function readCookie(req: Request, name: string): string | null {
  return parseCookies(req.headers.cookie)[name] ?? null;
}

/** SameSite=Lax + HttpOnly; Secure outside development (NFR-S1). */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.NODE_ENV === "staging",
    sameSite: "lax" as const,
    path: "/api/v1/auth",
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

export function readRefreshCookie(req: Request): string | null {
  return readCookie(req, REFRESH_COOKIE_NAME);
}
