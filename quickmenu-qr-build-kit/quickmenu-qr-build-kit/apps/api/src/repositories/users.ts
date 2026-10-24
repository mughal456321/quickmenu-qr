import type { PasswordResetToken, User, UserRole, UserWithPassword } from "@quickmenu/shared";
import { db, toIso, toIsoOrNull, type Queryable } from "./base";

type UserRow = {
  id: string;
  restaurant_id: string;
  email: string;
  name: string;
  role: UserRole;
  failed_attempts: number;
  locked_until: Date | null;
  is_active: boolean;
  created_at: Date;
};

type UserWithPasswordRow = UserRow & { password_hash: string };

const PUBLIC_COLUMNS =
  "id, restaurant_id, email, name, role, failed_attempts, locked_until, is_active, created_at";

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    email: row.email,
    name: row.name,
    role: row.role,
    failedAttempts: row.failed_attempts,
    lockedUntil: toIsoOrNull(row.locked_until),
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
  };
}

export function mapUserWithPassword(row: UserWithPasswordRow): UserWithPassword {
  return { ...mapUser(row), passwordHash: row.password_hash };
}

export async function getById(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<User | null> {
  const { rows } = await db(client).query<UserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE restaurant_id = $1 AND id = $2`,
    [restaurantId, id]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

/**
 * Internal auth-only lookup by id (the tenant is unknown when a password reset
 * token is redeemed). Never expose this to request-scoped business queries.
 */
export async function getByIdUnscoped(id: string, client?: Queryable): Promise<User | null> {
  const { rows } = await db(client).query<UserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

/** Login lookup. Email is globally unique, so this is not tenant-scoped. */
export async function getByEmail(
  email: string,
  client?: Queryable
): Promise<UserWithPassword | null> {
  const { rows } = await db(client).query<UserWithPasswordRow>(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] ? mapUserWithPassword(rows[0]) : null;
}

export async function listByRestaurant(
  restaurantId: string,
  client?: Queryable
): Promise<User[]> {
  const { rows } = await db(client).query<UserRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE restaurant_id = $1 ORDER BY created_at`,
    [restaurantId]
  );
  return rows.map(mapUser);
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  isActive?: boolean;
}

export async function create(
  restaurantId: string,
  input: CreateUserInput,
  client?: Queryable
): Promise<User> {
  const { rows } = await db(client).query<UserRow>(
    `INSERT INTO users (restaurant_id, email, name, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5::user_role, COALESCE($6, TRUE))
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      restaurantId,
      input.email,
      input.name,
      input.passwordHash,
      input.role,
      input.isActive ?? null,
    ]
  );
  return mapUser(rows[0]!);
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  passwordHash?: string;
  failedAttempts?: number;
  lockedUntil?: Date | null;
}

export async function update(
  restaurantId: string,
  id: string,
  patch: UpdateUserInput,
  client?: Queryable
): Promise<User | null> {
  const { rows } = await db(client).query<UserRow>(
    `UPDATE users
        SET name = COALESCE($3, name),
            role = COALESCE($4::user_role, role),
            is_active = COALESCE($5, is_active),
            password_hash = COALESCE($6, password_hash),
            failed_attempts = COALESCE($7, failed_attempts),
            locked_until = COALESCE($8, locked_until)
      WHERE restaurant_id = $1 AND id = $2
      RETURNING ${PUBLIC_COLUMNS}`,
    [
      restaurantId,
      id,
      patch.name ?? null,
      patch.role ?? null,
      patch.isActive ?? null,
      patch.passwordHash ?? null,
      patch.failedAttempts ?? null,
      patch.lockedUntil ?? null,
    ]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function deleteUser(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    "DELETE FROM users WHERE restaurant_id = $1 AND id = $2",
    [restaurantId, id]
  );
  return (rowCount ?? 0) > 0;
}

type ResetTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
};

export function mapResetToken(row: ResetTokenRow): PasswordResetToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: toIso(row.expires_at),
    usedAt: toIsoOrNull(row.used_at),
  };
}

export async function createResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  client?: Queryable
): Promise<PasswordResetToken> {
  const { rows } = await db(client).query<ResetTokenRow>(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, token_hash, expires_at, used_at`,
    [userId, tokenHash, expiresAt]
  );
  return mapResetToken(rows[0]!);
}

export async function getResetTokenByHash(
  tokenHash: string,
  client?: Queryable
): Promise<PasswordResetToken | null> {
  const { rows } = await db(client).query<ResetTokenRow>(
    `SELECT id, user_id, token_hash, expires_at, used_at
       FROM password_reset_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  return rows[0] ? mapResetToken(rows[0]) : null;
}

export async function markResetTokenUsed(id: string, client?: Queryable): Promise<void> {
  await db(client).query(
    "UPDATE password_reset_tokens SET used_at = now() WHERE id = $1",
    [id]
  );
}

export async function deleteResetTokensForUser(
  userId: string,
  client?: Queryable
): Promise<void> {
  await db(client).query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
}

export interface FailedLoginResult {
  failedAttempts: number;
  lockedUntil: string | null;
}

/**
 * NFR-S4: atomically increment the failure counter and set the lock once the
 * threshold is reached. Returning the new state avoids a read-after-write race.
 */
export async function recordFailedLogin(
  id: string,
  maxAttempts: number,
  lockMinutes: number,
  client?: Queryable
): Promise<FailedLoginResult> {
  const { rows } = await db(client).query<{
    failed_attempts: number;
    locked_until: Date | null;
  }>(
    `UPDATE users
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE
              WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3)
              ELSE locked_until
            END
      WHERE id = $1
      RETURNING failed_attempts, locked_until`,
    [id, maxAttempts, lockMinutes]
  );
  const row = rows[0]!;
  return {
    failedAttempts: row.failed_attempts,
    lockedUntil: toIsoOrNull(row.locked_until),
  };
}

/** Successful login or a password reset clears the lockout counter. */
export async function clearLockout(id: string, client?: Queryable): Promise<void> {
  await db(client).query(
    "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1",
    [id]
  );
}

/** Set a new hash and clear any lockout in one statement. */
export async function updatePassword(
  id: string,
  passwordHash: string,
  client?: Queryable
): Promise<void> {
  await db(client).query(
    `UPDATE users
        SET password_hash = $2, failed_attempts = 0, locked_until = NULL
      WHERE id = $1`,
    [id, passwordHash]
  );
}
