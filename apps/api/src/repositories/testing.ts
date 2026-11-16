import { getPool } from "../db";
import type { Queryable } from "./base";

/**
 * Test helper: empty every business table and reset identities. Kept here so all
 * SQL in the project lives under repositories/.
 */
export async function truncateAll(client?: Queryable): Promise<void> {
  await (client ?? getPool()).query(
    `TRUNCATE TABLE
       order_status_history, order_items, orders,
       item_images, item_variants, menu_items,
       translations, restaurant_tables, categories,
       password_reset_tokens, users, restaurants
     RESTART IDENTITY CASCADE`
  );
}

/** Test helper: simulate the 15-minute lockout window passing (NFR-S4). */
export async function expireLockout(email: string, client?: Queryable): Promise<void> {
  await (client ?? getPool()).query(
    "UPDATE users SET locked_until = now() - interval '1 minute' WHERE email = $1",
    [email]
  );
}

/** Test helper: simulate a reset token ageing past its 30-minute window (FR-04). */
export async function expireResetToken(
  tokenHash: string,
  client?: Queryable
): Promise<void> {
  await (client ?? getPool()).query(
    "UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = $1",
    [tokenHash]
  );
}
