import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistoryEntry,
  OrderWithItems,
} from "@quickmenu/shared";
import { db, toIso, toNumber, type Queryable } from "./base";

type OrderRow = {
  id: string;
  restaurant_id: string;
  table_id: string;
  order_number: number;
  status: OrderStatus;
  total: string;
  notes: string | null;
  client_request_id: string;
  created_at: Date;
  updated_at: Date;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  item_id: string | null;
  variant_id: string | null;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: string;
  special_instructions: string | null;
};

type StatusHistoryRow = {
  id: string;
  order_id: string;
  status: OrderStatus;
  changed_by: string | null;
  changed_at: Date;
};

const ORDER_COLUMNS =
  "id, restaurant_id, table_id, order_number, status, total, notes, client_request_id, created_at, updated_at";

const ORDER_ITEM_COLUMNS =
  "id, order_id, item_id, variant_id, item_name, variant_name, quantity, unit_price, special_instructions";

export function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableId: row.table_id,
    orderNumber: row.order_number,
    status: row.status,
    total: toNumber(row.total),
    notes: row.notes,
    clientRequestId: row.client_request_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    itemId: row.item_id,
    variantId: row.variant_id,
    itemName: row.item_name,
    variantName: row.variant_name,
    quantity: row.quantity,
    unitPrice: toNumber(row.unit_price),
    specialInstructions: row.special_instructions,
  };
}

export function mapStatusHistory(row: StatusHistoryRow): OrderStatusHistoryEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    changedBy: row.changed_by,
    changedAt: toIso(row.changed_at),
  };
}

/** Q3: active orders for the kitchen board. Uses `ix_orders_active`. */
export const ACTIVE_ORDERS_SQL = `
  SELECT ${ORDER_COLUMNS}
    FROM orders
   WHERE restaurant_id = $1
     AND status IN ('new', 'preparing', 'ready')
   ORDER BY created_at`;

export async function listActive(
  restaurantId: string,
  client?: Queryable
): Promise<Order[]> {
  const { rows } = await db(client).query<OrderRow>(ACTIVE_ORDERS_SQL, [restaurantId]);
  return rows.map(mapOrder);
}

export interface OrderHistoryFilters {
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
}

export interface OrderPage {
  orders: Order[];
  total: number;
}

export async function listHistory(
  restaurantId: string,
  filters: OrderHistoryFilters = {},
  client?: Queryable
): Promise<OrderPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const params = [
    restaurantId,
    filters.from ?? null,
    filters.to ?? null,
    pageSize,
    offset,
  ];

  const listResult = await db(client).query<OrderRow>(
    `SELECT ${ORDER_COLUMNS}
       FROM orders
      WHERE restaurant_id = $1
        AND ($2::timestamptz IS NULL OR created_at >= $2)
        AND ($3::timestamptz IS NULL OR created_at <= $3)
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5`,
    params
  );

  const countResult = await db(client).query<{ total: string }>(
    `SELECT count(*)::text AS total
       FROM orders
      WHERE restaurant_id = $1
        AND ($2::timestamptz IS NULL OR created_at >= $2)
        AND ($3::timestamptz IS NULL OR created_at <= $3)`,
    [restaurantId, filters.from ?? null, filters.to ?? null]
  );

  return {
    orders: listResult.rows.map(mapOrder),
    total: Number.parseInt(countResult.rows[0]?.total ?? "0", 10),
  };
}

export async function getById(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<OrderWithItems | null> {
  const { rows } = await db(client).query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE restaurant_id = $1 AND id = $2`,
    [restaurantId, id]
  );
  if (!rows[0]) return null;
  const items = await listItems(id, client);
  return { ...mapOrder(rows[0]), items };
}

/** Idempotency lookup: does an order with this client_request_id already exist? */
export async function findByClientRequestId(
  clientRequestId: string,
  client?: Queryable
): Promise<Order | null> {
  const { rows } = await db(client).query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE client_request_id = $1`,
    [clientRequestId]
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function listItems(
  orderId: string,
  client?: Queryable
): Promise<OrderItem[]> {
  const { rows } = await db(client).query<OrderItemRow>(
    `SELECT ${ORDER_ITEM_COLUMNS} FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId]
  );
  return rows.map(mapOrderItem);
}

export interface InsertOrderInput {
  restaurantId: string;
  tableId: string;
  orderNumber: number;
  total: number;
  notes?: string | null;
  clientRequestId: string;
  trackingTokenHash: string;
  status?: OrderStatus;
}

/**
 * Q4 primitive: insert the order, ignoring a duplicate client_request_id
 * (idempotent replay). Returns null when the order already existed.
 * Must run inside the same transaction as the counter increment and lines.
 */
export async function insertOrder(
  input: InsertOrderInput,
  client?: Queryable
): Promise<Order | null> {
  const { rows } = await db(client).query<OrderRow>(
    `INSERT INTO orders
       (restaurant_id, table_id, order_number, status, total, notes, client_request_id, tracking_token_hash)
     VALUES ($1, $2, $3, COALESCE($4::order_status, 'new'), $5, $6, $7, $8)
     ON CONFLICT (client_request_id) DO NOTHING
     RETURNING ${ORDER_COLUMNS}`,
    [
      input.restaurantId,
      input.tableId,
      input.orderNumber,
      input.status ?? null,
      input.total,
      input.notes ?? null,
      input.clientRequestId,
      input.trackingTokenHash,
    ]
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export interface InsertOrderItemInput {
  itemId: string | null;
  variantId: string | null;
  itemName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  specialInstructions?: string | null;
}

/** Q4 primitive: insert all lines of an order in one parameterized statement. */
export async function insertOrderItems(
  orderId: string,
  items: InsertOrderItemInput[],
  client?: Queryable
): Promise<OrderItem[]> {
  if (items.length === 0) return [];
  const { rows } = await db(client).query<OrderItemRow>(
    `INSERT INTO order_items
       (order_id, item_id, variant_id, item_name, variant_name, quantity, unit_price, special_instructions)
     SELECT $1, u.item_id, u.variant_id, u.item_name, u.variant_name, u.quantity, u.unit_price, u.special_instructions
       FROM unnest($2::uuid[], $3::uuid[], $4::varchar[], $5::varchar[], $6::smallint[], $7::numeric[], $8::text[])
         AS u(item_id, variant_id, item_name, variant_name, quantity, unit_price, special_instructions)
     RETURNING ${ORDER_ITEM_COLUMNS}`,
    [
      orderId,
      items.map((i) => i.itemId),
      items.map((i) => i.variantId),
      items.map((i) => i.itemName),
      items.map((i) => i.variantName),
      items.map((i) => i.quantity),
      items.map((i) => i.unitPrice),
      items.map((i) => i.specialInstructions ?? null),
    ]
  );
  return rows.map(mapOrderItem);
}

/** Q4 primitive: append a status history row. */
export async function insertStatusHistory(
  orderId: string,
  status: OrderStatus,
  changedBy: string | null,
  client?: Queryable
): Promise<OrderStatusHistoryEntry> {
  const { rows } = await db(client).query<StatusHistoryRow>(
    `INSERT INTO order_status_history (order_id, status, changed_by)
     VALUES ($1, $2::order_status, $3)
     RETURNING id, order_id, status, changed_by, changed_at`,
    [orderId, status, changedBy]
  );
  return mapStatusHistory(rows[0]!);
}

/**
 * Update an order's status and record the change. Call inside withTransaction so
 * both statements commit together (FR-31).
 */
export async function changeStatus(
  restaurantId: string,
  id: string,
  status: OrderStatus,
  changedBy: string | null,
  client?: Queryable
): Promise<Order | null> {
  const { rows } = await db(client).query<OrderRow>(
    `UPDATE orders
        SET status = $3::order_status, updated_at = now()
      WHERE restaurant_id = $1 AND id = $2
      RETURNING ${ORDER_COLUMNS}`,
    [restaurantId, id, status]
  );
  if (!rows[0]) return null;
  await insertStatusHistory(id, status, changedBy, client);
  return mapOrder(rows[0]);
}

export async function listStatusHistory(
  restaurantId: string,
  id: string,
  client?: Queryable
): Promise<OrderStatusHistoryEntry[]> {
  const { rows } = await db(client).query<StatusHistoryRow>(
    `SELECT h.id, h.order_id, h.status, h.changed_by, h.changed_at
       FROM order_status_history h
       JOIN orders o ON o.id = h.order_id
      WHERE o.restaurant_id = $1 AND h.order_id = $2
      ORDER BY h.changed_at`,
    [restaurantId, id]
  );
  return rows.map(mapStatusHistory);
}
