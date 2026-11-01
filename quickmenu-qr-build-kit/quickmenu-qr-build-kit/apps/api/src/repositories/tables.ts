import type { RestaurantTable } from "@quickmenu/shared";
import { db, toIso, type Queryable } from "./base";

type TableRow = {
  id: string;
  restaurant_id: string;
  table_number: string;
  qr_token: string;
  is_active: boolean;
  created_at: Date;
};

const COLUMNS = "id, restaurant_id, table_number, qr_token, is_active, created_at";

export function mapTable(row: TableRow): RestaurantTable {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableNumber: row.table_number,
    qrToken: row.qr_token,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
  };
}

export async function listByRestaurant(
  restaurantId: string,
  client?: Queryable
): Promise<RestaurantTable[]> {
  const { rows } = await db(client).query<TableRow>(
    `SELECT ${COLUMNS} FROM restaurant_tables
      WHERE restaurant_id = $1
      ORDER BY table_number`,
    [restaurantId]
  );
  return rows.map(mapTable);
}

export async function getById(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<RestaurantTable | null> {
  const { rows } = await db(client).query<TableRow>(
    `SELECT ${COLUMNS} FROM restaurant_tables WHERE restaurant_id = $1 AND id = $2`,
    [restaurantId, id]
  );
  return rows[0] ? mapTable(rows[0]) : null;
}

/** Batch-load tables for a page of orders without a per-row query. */
export async function getManyByIds(
  restaurantId: string,
  ids: string[],
  client?: Queryable
): Promise<RestaurantTable[]> {
  if (ids.length === 0) return [];
  const { rows } = await db(client).query<TableRow>(
    `SELECT ${COLUMNS}
       FROM restaurant_tables
      WHERE restaurant_id = $1 AND id = ANY($2::uuid[])`,
    [restaurantId, ids]
  );
  return rows.map(mapTable);
}

/** Q1: resolve a scanned QR token to its table. Not tenant-scoped by design. */
export async function findByQrToken(
  qrToken: string,
  client?: Queryable
): Promise<RestaurantTable | null> {
  const { rows } = await db(client).query<TableRow>(
    `SELECT ${COLUMNS} FROM restaurant_tables WHERE qr_token = $1`,
    [qrToken]
  );
  return rows[0] ? mapTable(rows[0]) : null;
}

export interface CreateTableInput {
  tableNumber: string;
  qrToken: string;
  isActive?: boolean;
}

export async function create(
  restaurantId: string,
  input: CreateTableInput,
  client?: Queryable
): Promise<RestaurantTable> {
  const { rows } = await db(client).query<TableRow>(
    `INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token, is_active)
     VALUES ($1, $2, $3, COALESCE($4, TRUE))
     RETURNING ${COLUMNS}`,
    [restaurantId, input.tableNumber, input.qrToken, input.isActive ?? null]
  );
  return mapTable(rows[0]!);
}

export interface UpdateTableInput {
  tableNumber?: string;
  qrToken?: string;
  isActive?: boolean;
}

export async function update(
  restaurantId: string,
  id: string,
  patch: UpdateTableInput,
  client?: Queryable
): Promise<RestaurantTable | null> {
  const { rows } = await db(client).query<TableRow>(
    `UPDATE restaurant_tables
        SET table_number = COALESCE($3, table_number),
            qr_token = COALESCE($4, qr_token),
            is_active = COALESCE($5, is_active)
      WHERE restaurant_id = $1 AND id = $2
      RETURNING ${COLUMNS}`,
    [
      restaurantId,
      id,
      patch.tableNumber ?? null,
      patch.qrToken ?? null,
      patch.isActive ?? null,
    ]
  );
  return rows[0] ? mapTable(rows[0]) : null;
}

export async function deleteTable(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<boolean> {
  const { rowCount } = await db(client).query(
    "DELETE FROM restaurant_tables WHERE restaurant_id = $1 AND id = $2",
    [restaurantId, id]
  );
  return (rowCount ?? 0) > 0;
}
