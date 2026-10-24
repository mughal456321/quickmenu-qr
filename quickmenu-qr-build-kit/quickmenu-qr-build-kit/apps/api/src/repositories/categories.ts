import type { Category } from "@quickmenu/shared";
import { db, toIso, type Queryable } from "./base";

type CategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: Date;
};

const COLUMNS = "id, restaurant_id, name, display_order, is_active, created_at";

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
  };
}

export interface ListCategoriesOptions {
  activeOnly?: boolean;
}

export async function listByRestaurant(
  restaurantId: string,
  options: ListCategoriesOptions = {},
  client?: Queryable
): Promise<Category[]> {
  const { rows } = await db(client).query<CategoryRow>(
    `SELECT ${COLUMNS}
       FROM categories
      WHERE restaurant_id = $1
        AND ($2::boolean IS NOT TRUE OR is_active)
      ORDER BY display_order, created_at`,
    [restaurantId, options.activeOnly ?? false]
  );
  return rows.map(mapCategory);
}

export async function getById(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<Category | null> {
  const { rows } = await db(client).query<CategoryRow>(
    `SELECT ${COLUMNS} FROM categories WHERE restaurant_id = $1 AND id = $2`,
    [restaurantId, id]
  );
  return rows[0] ? mapCategory(rows[0]) : null;
}

export interface CreateCategoryInput {
  name: string;
  displayOrder?: number;
  isActive?: boolean;
}

export async function create(
  restaurantId: string,
  input: CreateCategoryInput,
  client?: Queryable
): Promise<Category> {
  const { rows } = await db(client).query<CategoryRow>(
    `INSERT INTO categories (restaurant_id, name, display_order, is_active)
     VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, TRUE))
     RETURNING ${COLUMNS}`,
    [restaurantId, input.name, input.displayOrder ?? null, input.isActive ?? null]
  );
  return mapCategory(rows[0]!);
}

export interface UpdateCategoryInput {
  name?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export async function update(
  restaurantId: string,
  id: string,
  patch: UpdateCategoryInput,
  client?: Queryable
): Promise<Category | null> {
  const { rows } = await db(client).query<CategoryRow>(
    `UPDATE categories
        SET name = COALESCE($3, name),
            display_order = COALESCE($4, display_order),
            is_active = COALESCE($5, is_active)
      WHERE restaurant_id = $1 AND id = $2
      RETURNING ${COLUMNS}`,
    [
      restaurantId,
      id,
      patch.name ?? null,
      patch.displayOrder ?? null,
      patch.isActive ?? null,
    ]
  );
  return rows[0] ? mapCategory(rows[0]) : null;
}

export async function deleteCategory(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    "DELETE FROM categories WHERE restaurant_id = $1 AND id = $2",
    [restaurantId, id]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Rewrite display_order for the given category ids in one statement (FR-06).
 * Returns the number of rows updated; the caller verifies it equals ids.length
 * so that an id from another restaurant is rejected.
 */
export async function reorder(
  restaurantId: string,
  ids: string[],
  client?: Queryable
): Promise<number> {
  if (ids.length === 0) return 0;
  const { rowCount } = await db(client).query(
    `UPDATE categories c
        SET display_order = v.ord
       FROM unnest($2::uuid[]) WITH ORDINALITY AS v(id, ord)
      WHERE c.id = v.id AND c.restaurant_id = $1`,
    [restaurantId, ids]
  );
  return rowCount ?? 0;
}
