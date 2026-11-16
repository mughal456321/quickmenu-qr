import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@quickmenu/shared";
import { ApiError } from "../errors";
import { verifyAccessToken } from "../lib/tokens";

export interface AuthContext {
  userId: string;
  restaurantId: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function unauthenticated(message: string): ApiError {
  return new ApiError(401, "UNAUTHENTICATED", message);
}

/** Verifies the Bearer access token and attaches the tenant context. */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  if (!token) {
    next(unauthenticated("Authentication required."));
    return;
  }
  const claims = verifyAccessToken(token);
  if (!claims) {
    next(unauthenticated("Missing, invalid, or expired token."));
    return;
  }
  req.auth = {
    userId: claims.sub,
    restaurantId: claims.restaurantId,
    role: claims.role,
  };
  next();
}

/** Role gate; must run after `authenticate`. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthenticated("Authentication required."));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(
        new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.")
      );
      return;
    }
    next();
  };
}

/** Narrowing helper for controllers that run behind `authenticate`. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthenticated("Authentication required.");
  return req.auth;
}
