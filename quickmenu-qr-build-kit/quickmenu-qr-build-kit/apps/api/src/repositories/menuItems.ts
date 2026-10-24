import type {
  ItemImage,
  ItemVariant,
  MenuCategory,
  MenuItem,
  MenuItemWithDetails,
} from "@quickmenu/shared";
import { db, toIso, toNumber, type Queryable } from "./base";

type MenuItemRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: string;
  is_available: boolean;
  dietary_tags: string[];
  allergens: string[];
  display_order: number;
  created_at: Date;
  updated_at: Date;
};

type VariantRow = {
  id: string;
  item_id: string;
  name: string;
  price: string;
  display_order: number;
};

type ImageRow = {
  id: string;
  item_id: string;
  public_id: string;
  url: string;
  display_order: number;
};

const ITEM_COLUMNS =
  "id, restaurant_id, category_id, name, description, base_price, is_available, dietary_tags, allergens, display_order, created_at, updated_at";

export function mapMenuItem(row: MenuItemRow): MenuItem {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    basePrice: toNumber(row.base_price),
    isAvailable: row.is_available,
    dietaryTags: row.dietary_tags,
    allergens: row.allergens,
    displayOrder: row.display_order,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapVariant(row: VariantRow): ItemVariant {
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.name,
    price: toNumber(row.price),
    displayOrder: row.display_order,
  };
}

export function mapImage(row: ImageRow): ItemImage {
  return {
    id: row.id,
    itemId: row.item_id,
    publicId: row.public_id,
    url: row.url,
    displayOrder: row.display_order,
  };
}

async function loadVariants(
  itemIds: string[],
  client?: Queryable
): Promise<Map<string, ItemVariant[]>> {
  const grouped = new Map<string, ItemVariant[]>();
  if (itemIds.length === 0) return grouped;
  const { rows } = await db(client).query<VariantRow>(
    `SELECT id, item_id, name, price, display_order
       FROM item_variants
      WHERE item_id = ANY($1::uuid[])
      ORDER BY display_order, name`,
    [itemIds]
  );
  for (const row of rows) {
    const list = grouped.get(row.item_id) ?? [];
    list.push(mapVariant(row));
    grouped.set(row.item_id, list);
  }
  return grouped;
}

async function loadImages(
  itemIds: string[],
  client?: Queryable
): Promise<Map<string, ItemImage[]>> {
  const grouped = new Map<string, ItemImage[]>();
  if (itemIds.length === 0) return grouped;
  const { rows } = await db(client).query<ImageRow>(
    `SELECT id, item_id, public_id, url, display_order
       FROM item_images
      WHERE item_id = ANY($1::uuid[])
      ORDER BY display_order, id`,
    [itemIds]
  );
  for (const row of rows) {
    const list = grouped.get(row.item_id) ?? [];
    list.push(mapImage(row));
    grouped.set(row.item_id, list);
  }
  return grouped;
}

async function attachDetails(
  items: MenuItem[],
  client?: Queryable
): Promise<MenuItemWithDetails[]> {
  const ids = items.map((i) => i.id);
  const [variants, images] = await Promise.all([
    loadVariants(ids, client),
    loadImages(ids, client),
  ]);
  return items.map((item) => ({
    ...item,
    variants: variants.get(item.id) ?? [],
    images: images.get(item.id) ?? [],
  }));
}

export interface MenuFilters {
  /** Only return items that are currently available. */
  onlyAvailable?: boolean;
  /** Q2 include rule: item must carry all of these dietary tags (`@>`). */
  dietaryTags?: string[] | null;
  /** Q2 exclude rule: item must carry none of these allergens (`&&`). */
  excludeAllergens?: string[] | null;
  /** Q2 name search, fuzzy and case-insensitive (pg_trgm). */
  search?: string | null;
}

type CategoryRow = {
  id: string;
  name: string;
  display_order: number;
};

/**
 * Public customer menu (Q1) and filtered menu (Q2) for a restaurant.
 * Returns active categories with their (optionally filtered) items, variants,
 * and images. A single static statement keeps the SQL concatenation-free.
 */
export async function getMenu(
  restaurantId: string,
  filters: MenuFilters = {},
  client?: Queryable
): Promise<MenuCategory[]> {
  const categoriesResult = await db(client).query<CategoryRow>(
    `SELECT id, name, display_order
       FROM categories
      WHERE restaurant_id = $1 AND is_active
      ORDER BY display_order, created_at`,
    [restaurantId]
  );

  const itemsResult = await db(client).query<MenuItemRow>(
    `SELECT ${ITEM_COLUMNS}
       FROM menu_items
      WHERE restaurant_id = $1
        AND ($2::boolean IS NOT TRUE OR is_available)
        AND ($3::text[] IS NULL OR dietary_tags @> $3)
        AND ($4::text[] IS NULL OR NOT (allergens && $4))
        AND ($5::text IS NULL OR name ILIKE '%' || $5 || '%')
      ORDER BY display_order, created_at`,
    [
      restaurantId,
      filters.onlyAvailable ?? false,
      filters.dietaryTags ?? null,
      filters.excludeAllergens ?? null,
      filters.search ?? null,
    ]
  );

  const items = await attachDetails(itemsResult.rows.map(mapMenuItem), client);
  const byCategory = new Map<string, MenuItemWithDetails[]>();
  for (const item of items) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  const hasItemFilters =
    filters.onlyAvailable === true ||
    (filters.dietaryTags?.length ?? 0) > 0 ||
    (filters.excludeAllergens?.length ?? 0) > 0 ||
    Boolean(filters.search);

  return categoriesResult.rows
    .map((category) => ({
      id: category.id,
      name: category.name,
      displayOrder: category.display_order,
      items: byCategory.get(category.id) ?? [],
    }))
    .filter((category) => !hasItemFilters || category.items.length > 0);
}

export async function getById(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<MenuItemWithDetails | null> {
  const { rows } = await db(client).query<MenuItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM menu_items WHERE restaurant_id = $1 AND id = $2`,
    [restaurantId, id]
  );
  if (!rows[0]) return null;
  const [item] = await attachDetails([mapMenuItem(rows[0])], client);
  return item ?? null;
}

export async function listByCategory(
  restaurantId: string,
  categoryId: string,
  client?: Queryable
): Promise<MenuItem[]> {
  const { rows } = await db(client).query<MenuItemRow>(
    `SELECT ${ITEM_COLUMNS}
       FROM menu_items
      WHERE restaurant_id = $1 AND category_id = $2
      ORDER BY display_order, created_at`,
    [restaurantId, categoryId]
  );
  return rows.map(mapMenuItem);
}

export interface CreateMenuItemInput {
  categoryId: string;
  name: string;
  description?: string | null;
  basePrice: number;
  isAvailable?: boolean;
  dietaryTags?: string[];
  allergens?: string[];
  displayOrder?: number;
}

export async function create(
  restaurantId: string,
  input: CreateMenuItemInput,
  client?: Queryable
): Promise<MenuItem> {
  const { rows } = await db(client).query<MenuItemRow>(
    `INSERT INTO menu_items
       (restaurant_id, category_id, name, description, base_price, is_available, dietary_tags, allergens, display_order)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE), COALESCE($7, '{}'::text[]), COALESCE($8, '{}'::text[]), COALESCE($9, 0))
     RETURNING ${ITEM_COLUMNS}`,
    [
      restaurantId,
      input.categoryId,
      input.name,
      input.description ?? null,
      input.basePrice,
      input.isAvailable ?? null,
      input.dietaryTags ?? null,
      input.allergens ?? null,
      input.displayOrder ?? null,
    ]
  );
  return mapMenuItem(rows[0]!);
}

export interface UpdateMenuItemInput {
  categoryId?: string;
  name?: string;
  description?: string | null;
  basePrice?: number;
  isAvailable?: boolean;
  dietaryTags?: string[];
  allergens?: string[];
  displayOrder?: number;
}

export async function update(
  restaurantId: string,
  id: string,
  patch: UpdateMenuItemInput,
  client?: Queryable
): Promise<MenuItem | null> {
  const { rows } = await db(client).query<MenuItemRow>(
    `UPDATE menu_items
        SET category_id = COALESCE($3, category_id),
            name = COALESCE($4, name),
            description = COALESCE($5, description),
            base_price = COALESCE($6, base_price),
            is_available = COALESCE($7, is_available),
            dietary_tags = COALESCE($8, dietary_tags),
            allergens = COALESCE($9, allergens),
            display_order = COALESCE($10, display_order),
            updated_at = now()
      WHERE restaurant_id = $1 AND id = $2
      RETURNING ${ITEM_COLUMNS}`,
    [
      restaurantId,
      id,
      patch.categoryId ?? null,
      patch.name ?? null,
      patch.description ?? null,
      patch.basePrice ?? null,
      patch.isAvailable ?? null,
      patch.dietaryTags ?? null,
      patch.allergens ?? null,
      patch.displayOrder ?? null,
    ]
  );
  return rows[0] ? mapMenuItem(rows[0]) : null;
}

export async function setAvailability(
  restaurantId: string,
  id: string,
  isAvailable: boolean,
  client?: Queryable
): Promise<MenuItem | null> {
  const { rows } = await db(client).query<MenuItemRow>(
    `UPDATE menu_items
        SET is_available = $3, updated_at = now()
      WHERE restaurant_id = $1 AND id = $2
      RETURNING ${ITEM_COLUMNS}`,
    [restaurantId, id, isAvailable]
  );
  return rows[0] ? mapMenuItem(rows[0]) : null;
}

export async function deleteItem(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    "DELETE FROM menu_items WHERE restaurant_id = $1 AND id = $2",
    [restaurantId, id]
  );
  return (rowCount ?? 0) > 0;
}

export interface CreateVariantInput {
  name: string;
  price: number;
  displayOrder?: number;
}

export async function addVariant(
  restaurantId: string,
  itemId: string,
  input: CreateVariantInput,
  client?: Queryable
): Promise<ItemVariant | null> {
  const { rows } = await db(client).query<VariantRow>(
    `INSERT INTO item_variants (item_id, name, price, display_order)
     SELECT i.id, $3, $4, COALESCE($5, 0)
       FROM menu_items i
      WHERE i.id = $2 AND i.restaurant_id = $1
     RETURNING id, item_id, name, price, display_order`,
    [restaurantId, itemId, input.name, input.price, input.displayOrder ?? null]
  );
  return rows[0] ? mapVariant(rows[0]) : null;
}

export async function listVariants(
  restaurantId: string,
  itemId: string,
  client?: Queryable
): Promise<ItemVariant[]> {
  const { rows } = await db(client).query<VariantRow>(
    `SELECT v.id, v.item_id, v.name, v.price, v.display_order
       FROM item_variants v
       JOIN menu_items i ON i.id = v.item_id
      WHERE i.restaurant_id = $1 AND v.item_id = $2
      ORDER BY v.display_order, v.name`,
    [restaurantId, itemId]
  );
  return rows.map(mapVariant);
}

export interface UpdateVariantInput {
  name?: string;
  price?: number;
  displayOrder?: number;
}

export async function updateVariant(
  restaurantId: string,
  itemId: string,
  variantId: string,
  patch: UpdateVariantInput,
  client?: Queryable
): Promise<ItemVariant | null> {
  const { rows } = await db(client).query<VariantRow>(
    `UPDATE item_variants v
        SET name = COALESCE($4, v.name),
            price = COALESCE($5, v.price),
            display_order = COALESCE($6, v.display_order)
       FROM menu_items i
      WHERE v.id = $3 AND v.item_id = i.id
        AND i.id = $2 AND i.restaurant_id = $1
     RETURNING v.id, v.item_id, v.name, v.price, v.display_order`,
    [
      restaurantId,
      itemId,
      variantId,
      patch.name ?? null,
      patch.price ?? null,
      patch.displayOrder ?? null,
    ]
  );
  return rows[0] ? mapVariant(rows[0]) : null;
}

export async function deleteVariant(
  restaurantId: string,
  itemId: string,
  variantId: string,
  client?: Queryable
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `DELETE FROM item_variants v
       USING menu_items i
      WHERE v.id = $3 AND v.item_id = i.id
        AND i.id = $2 AND i.restaurant_id = $1`,
    [restaurantId, itemId, variantId]
  );
  return (rowCount ?? 0) > 0;
}

export interface CreateImageInput {
  publicId: string;
  url: string;
  displayOrder?: number;
}

export async function addImage(
  restaurantId: string,
  itemId: string,
  input: CreateImageInput,
  client?: Queryable
): Promise<ItemImage | null> {
  const { rows } = await db(client).query<ImageRow>(
    `INSERT INTO item_images (item_id, public_id, url, display_order)
     SELECT i.id, $3, $4, COALESCE($5, 0)
       FROM menu_items i
      WHERE i.id = $2 AND i.restaurant_id = $1
     RETURNING id, item_id, public_id, url, display_order`,
    [restaurantId, itemId, input.publicId, input.url, input.displayOrder ?? null]
  );
  return rows[0] ? mapImage(rows[0]) : null;
}

export async function listImages(
  restaurantId: string,
  itemId: string,
  client?: Queryable
): Promise<ItemImage[]> {
  const { rows } = await db(client).query<ImageRow>(
    `SELECT img.id, img.item_id, img.public_id, img.url, img.display_order
       FROM item_images img
       JOIN menu_items i ON i.id = img.item_id
      WHERE i.restaurant_id = $1 AND img.item_id = $2
      ORDER BY img.display_order, img.id`,
    [restaurantId, itemId]
  );
  return rows.map(mapImage);
}

export async function deleteImage(
  restaurantId: string,
  itemId: string,
  imageId: string,
  client?: Queryable
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    `DELETE FROM item_images img
       USING menu_items i
      WHERE img.id = $3 AND img.item_id = i.id
        AND i.id = $2 AND i.restaurant_id = $1`,
    [restaurantId, itemId, imageId]
  );
  return (rowCount ?? 0) > 0;
}
