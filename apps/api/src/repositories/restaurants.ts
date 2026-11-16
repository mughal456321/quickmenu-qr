import type { Restaurant } from "@quickmenu/shared";
import { db, toIso, type Queryable } from "./base";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  default_language: string;
  currency: string;
  order_counter: number;
  created_at: Date;
  updated_at: Date;
};

export function mapRestaurant(row: RestaurantRow): Restaurant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    defaultLanguage: row.default_language,
    currency: row.currency,
    orderCounter: row.order_counter,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const COLUMNS =
  "id, name, slug, default_language, currency, order_counter, created_at, updated_at";

export interface CreateRestaurantInput {
  name: string;
  slug: string;
  defaultLanguage?: string;
  currency?: string;
}

export async function getById(id: string, client?: Queryable): Promise<Restaurant | null> {
  const { rows } = await db(client).query<RestaurantRow>(
    `SELECT ${COLUMNS} FROM restaurants WHERE id = $1`,
    [id]
  );
  return rows[0] ? mapRestaurant(rows[0]) : null;
}

export async function getBySlug(slug: string, client?: Queryable): Promise<Restaurant | null> {
  const { rows } = await db(client).query<RestaurantRow>(
    `SELECT ${COLUMNS} FROM restaurants WHERE slug = $1`,
    [slug]
  );
  return rows[0] ? mapRestaurant(rows[0]) : null;
}

export async function create(
  input: CreateRestaurantInput,
  client?: Queryable
): Promise<Restaurant> {
  const { rows } = await db(client).query<RestaurantRow>(
    `INSERT INTO restaurants (name, slug, default_language, currency)
     VALUES ($1, $2, COALESCE($3, 'en'), COALESCE($4, 'PKR'))
     RETURNING ${COLUMNS}`,
    [input.name, input.slug, input.defaultLanguage ?? null, input.currency ?? null]
  );
  return mapRestaurant(rows[0]!);
}

export interface UpdateRestaurantInput {
  name?: string;
  defaultLanguage?: string;
  currency?: string;
}

export async function update(
  id: string,
  patch: UpdateRestaurantInput,
  client?: Queryable
): Promise<Restaurant | null> {
  const { rows } = await db(client).query<RestaurantRow>(
    `UPDATE restaurants
        SET name = COALESCE($2, name),
            default_language = COALESCE($3, default_language),
            currency = COALESCE($4, currency),
            updated_at = now()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, patch.name ?? null, patch.defaultLanguage ?? null, patch.currency ?? null]
  );
  return rows[0] ? mapRestaurant(rows[0]) : null;
}

export async function deleteBySlug(slug: string, client?: Queryable): Promise<boolean> {
  const { rowCount } = await db(client).query("DELETE FROM restaurants WHERE slug = $1", [
    slug,
  ]);
  return (rowCount ?? 0) > 0;
}

/**
 * Q4 primitive: atomically reserve the next order number for a restaurant.
 * Must be called inside the same transaction that inserts the order.
 */
export async function incrementOrderCounter(id: string, client?: Queryable): Promise<number> {
  const { rows } = await db(client).query<{ order_counter: number }>(
    `UPDATE restaurants
        SET order_counter = order_counter + 1,
            updated_at = now()
      WHERE id = $1
      RETURNING order_counter`,
    [id]
  );
  return rows[0]!.order_counter;
}
