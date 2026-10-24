import type {
  AuthSession,
  AuthUser,
  MeResponse,
  RegisterInput,
  User,
} from "@quickmenu/shared";
import { env } from "../config";
import { withTransaction } from "../db";
import { ApiError } from "../errors";
import { getMailer } from "../mail/mailer";
import { hashPassword, verifyPassword } from "../lib/password";
import { slugify } from "../lib/slug";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  RESET_TOKEN_TTL_MINUTES,
  createResetToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/tokens";
import * as restaurants from "../repositories/restaurants";
import * as users from "../repositories/users";
import type { Queryable } from "../repositories/base";

/** NFR-S4. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export interface AuthSessionWithRefresh extends AuthSession {
  refreshToken: string;
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId,
  };
}

function sessionFor(user: User): AuthSessionWithRefresh {
  return {
    accessToken: signAccessToken(user),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: toAuthUser(user),
    refreshToken: signRefreshToken(user),
  };
}

function invalidCredentials(): ApiError {
  // Generic message: never reveal whether the email exists (no enumeration).
  return new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
}

function accountLocked(): ApiError {
  return new ApiError(
    423,
    "ACCOUNT_LOCKED",
    "Too many failed login attempts. Try again in 15 minutes."
  );
}

async function uniqueSlug(name: string, client: Queryable): Promise<string> {
  const base = slugify(name);
  for (let i = 1; i <= 50; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await restaurants.getBySlug(candidate, client))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** FR-01: create the restaurant (unique slug) and its owner in one transaction. */
export async function register(input: RegisterInput): Promise<AuthSessionWithRefresh> {
  if (await users.getByEmail(input.email)) {
    throw new ApiError(409, "CONFLICT", "An account with that email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const { user } = await withTransaction(async (client) => {
    const slug = await uniqueSlug(input.restaurantName, client);
    const restaurant = await restaurants.create(
      {
        name: input.restaurantName,
        slug,
        defaultLanguage: input.defaultLanguage,
        currency: input.currency,
      },
      client
    );
    const owner = await users.create(
      restaurant.id,
      { email: input.email, name: input.name, passwordHash, role: "owner" },
      client
    );
    return { restaurant, user: owner };
  });

  return sessionFor(user);
}

/** FR-02 + NFR-S4: authenticate, track failures, and lock after 5 attempts. */
export async function login(
  email: string,
  password: string
): Promise<AuthSessionWithRefresh> {
  const user = await users.getByEmail(email);
  if (!user || !user.isActive) throw invalidCredentials();

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    throw accountLocked();
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const result = await users.recordFailedLogin(
      user.id,
      MAX_FAILED_ATTEMPTS,
      LOCKOUT_MINUTES
    );
    if (result.lockedUntil && new Date(result.lockedUntil).getTime() > Date.now()) {
      throw accountLocked();
    }
    throw invalidCredentials();
  }

  if (user.failedAttempts !== 0 || user.lockedUntil !== null) {
    await users.clearLockout(user.id);
  }
  return sessionFor(user);
}

/** FR-03 / NFR-S3: issue a fresh access token from the refresh cookie. */
export async function refresh(
  refreshToken: string
): Promise<AuthSession> {
  const claims = verifyRefreshToken(refreshToken);
  if (!claims) {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid or expired session.");
  }
  const user = await users.getById(claims.restaurantId, claims.sub);
  if (!user || !user.isActive) {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid or expired session.");
  }
  return {
    accessToken: signAccessToken(user),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: toAuthUser(user),
  };
}

/**
 * FR-04: always succeeds from the caller's perspective; only send mail when the
 * account exists, so the response cannot be used to enumerate emails.
 */
export async function forgotPassword(email: string): Promise<void> {
  const user = await users.getByEmail(email);
  if (!user || !user.isActive) return;

  const { token, hash, expiresAt } = createResetToken();
  await users.deleteResetTokensForUser(user.id);
  await users.createResetToken(user.id, hash, expiresAt);

  const base = env.FRONTEND_ORIGIN.replace(/\/+$/, "");
  await getMailer().sendPasswordReset({
    to: user.email,
    resetUrl: `${base}/reset-password?token=${encodeURIComponent(token)}`,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  });
}

/** FR-04: redeem a single-use, 30-minute reset token and clear any lockout. */
export async function resetPassword(token: string, password: string): Promise<void> {
  const record = await users.getResetTokenByHash(hashToken(token));
  const expired =
    !record ||
    record.usedAt !== null ||
    new Date(record.expiresAt).getTime() <= Date.now();
  if (expired) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid or expired reset token.", [
      { field: "token", issue: "invalid or expired" },
    ]);
  }

  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    await users.updatePassword(record.userId, passwordHash, client);
    await users.markResetTokenUsed(record.id, client);
    await users.deleteResetTokensForUser(record.userId, client);
  });
}

/** FR-05: current user plus their restaurant profile. */
export async function getMe(userId: string, restaurantId: string): Promise<MeResponse> {
  const [user, restaurant] = await Promise.all([
    users.getById(restaurantId, userId),
    restaurants.getById(restaurantId),
  ]);
  if (!user || !restaurant) {
    throw new ApiError(404, "NOT_FOUND", "Account not found.");
  }
  return { user, restaurant };
}
