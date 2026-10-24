import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@quickmenu/shared";
import { env } from "../config";

/** NFR-S3: access token 60 minutes, refresh token 7 days. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** FR-04: reset links are valid for 30 minutes and single use. */
export const RESET_TOKEN_TTL_MINUTES = 30;
export const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;

export const REFRESH_COOKIE_NAME = "qm_refresh";

export interface AccessTokenClaims {
  sub: string;
  restaurantId: string;
  role: UserRole;
}

export interface RefreshTokenClaims extends AccessTokenClaims {
  type: "refresh";
}

export interface TokenUser {
  id: string;
  restaurantId: string;
  role: UserRole;
}

export function signAccessToken(user: TokenUser): string {
  return jwt.sign(
    { restaurantId: user.restaurantId, role: user.role },
    env.JWT_ACCESS_SECRET,
    { subject: user.id, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );
}

export function signRefreshToken(user: TokenUser): string {
  return jwt.sign(
    { restaurantId: user.restaurantId, role: user.role, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    { subject: user.id, expiresIn: REFRESH_TOKEN_TTL_SECONDS }
  );
}

function toClaims(payload: string | jwt.JwtPayload): AccessTokenClaims | null {
  if (typeof payload === "string") return null;
  const { sub, restaurantId, role } = payload;
  if (typeof sub !== "string" || typeof restaurantId !== "string") return null;
  if (role !== "owner" && role !== "kitchen") return null;
  return { sub, restaurantId, role };
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    return toClaims(jwt.verify(token, env.JWT_ACCESS_SECRET));
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof payload === "string" || payload.type !== "refresh") return null;
    const claims = toClaims(payload);
    return claims ? { ...claims, type: "refresh" } : null;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface GeneratedResetToken {
  token: string;
  hash: string;
  expiresAt: Date;
}

/** 32 random bytes, returned raw to the caller and stored only as SHA-256. */
export function createResetToken(): GeneratedResetToken {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}
