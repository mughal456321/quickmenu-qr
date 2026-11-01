import { randomUUID } from "crypto";
import type {
  KitchenOrder,
  Order,
  OrderItem,
  OrderListQuery,
  PublicOrderCreated,
  PublicOrderLine,
  PublicOrderStatus,
  PublicOrderInput,
} from "@quickmenu/shared";
import { env } from "../config";
import { withTransaction } from "../db";
import {
  ConflictError,
  InvalidStatusTransitionAppError,
  NotFoundError,
  TableInactiveError,
} from "../errors";
import { createTrackingToken, hashToken, verifyTokenHash } from "../domain/tracking";
import { canTransition } from "../domain/statusMachine";
import { fromMinor } from "../domain/money";
import {
  priceOrder,
  type PricingItem,
  type PricingMenu,
} from "../domain/pricing";
import { emitOrderCreated, emitOrderStatusChanged } from "../events/orderEvents";
import * as menuItemsRepo from "../repositories/menuItems";
import * as ordersRepo from "../repositories/orders";
import * as restaurantsRepo from "../repositories/restaurants";
import * as tablesRepo from "../repositories/tables";

const DEFAULT_KITCHEN_STATUSES = ["new", "preparing", "ready"] as const;

/** Thrown inside the transaction when a concurrent replay won the insert. */
class ReplayConflictError extends Error {}

function money(value: number): string {
  return value.toFixed(2);
}

function toPricingMenu(
  restaurantId: string,
  items: Awaited<ReturnType<typeof menuItemsRepo.getManyByIds>>
): PricingMenu {
  const pricingItems: PricingItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    restaurantId: item.restaurantId,
    basePrice: money(item.basePrice),
    isAvailable: item.isAvailable,
    variants: item.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: money(variant.price),
    })),
  }));
  return { restaurantId, items: pricingItems };
}

function toPublicLines(items: OrderItem[]): PublicOrderLine[] {
  return items.map((item) => ({
    name: item.itemName,
    variant: item.variantName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    specialInstructions: item.specialInstructions,
  }));
}

async function buildCreated(
  order: Order,
  currency: string
): Promise<PublicOrderCreated> {
  const [table, items] = await Promise.all([
    tablesRepo.getById(order.restaurantId, order.tableId),
    ordersRepo.listItems(order.id),
  ]);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    table: { number: table?.tableNumber ?? "" },
    items: toPublicLines(items),
    total: order.total,
    currency,
    trackingToken: createTrackingToken(order.id, env.TRACKING_SECRET),
    createdAt: order.createdAt,
  };
}

export interface CreateOrderResult {
  order: PublicOrderCreated;
  replayed: boolean;
}

/**
 * Create an order (FR-23..FR-28, NFR-R4, NFR-R5).
 *
 * Everything that mutates the database happens in one transaction: counter
 * increment, order row, snapshot lines and the first history row. A repeated
 * Idempotency-Key returns the original order and creates nothing.
 */
export async function createOrder(
  input: PublicOrderInput,
  idempotencyKey: string
): Promise<CreateOrderResult> {
  const table = await tablesRepo.findByQrToken(input.qrToken);
  if (!table) {
    throw new NotFoundError("Menu not found.");
  }
  if (!table.isActive) {
    throw new TableInactiveError();
  }

  const existing = await ordersRepo.findByClientRequestId(idempotencyKey);
  if (existing) {
    return replay(existing, table.id);
  }

  const restaurant = await restaurantsRepo.getById(table.restaurantId);
  if (!restaurant) {
    throw new NotFoundError("Menu not found.");
  }

  const itemIds = [...new Set(input.items.map((line) => line.itemId))];
  const loadedItems = await menuItemsRepo.getManyByIds(restaurant.id, itemIds);
  const priced = priceOrder(toPricingMenu(restaurant.id, loadedItems), input.items);

  const orderId = randomUUID();
  const trackingToken = createTrackingToken(orderId, env.TRACKING_SECRET);

  let order: Order;
  try {
    order = await withTransaction(async (client) => {
      const orderNumber = await restaurantsRepo.incrementOrderCounter(
        restaurant.id,
        client
      );
      const inserted = await ordersRepo.insertOrder(
        {
          id: orderId,
          restaurantId: restaurant.id,
          tableId: table.id,
          orderNumber,
          total: fromMinor(priced.totalMinor),
          notes: input.notes ?? null,
          clientRequestId: idempotencyKey,
          trackingTokenHash: hashToken(trackingToken),
        },
        client
      );
      if (!inserted) throw new ReplayConflictError();

      await ordersRepo.insertOrderItems(
        inserted.id,
        priced.lines.map((line) => ({
          itemId: line.itemId,
          variantId: line.variantId,
          itemName: line.itemName,
          variantName: line.variantName,
          quantity: line.quantity,
          unitPrice: fromMinor(line.unitPriceMinor),
          specialInstructions: line.specialInstructions,
        })),
        client
      );
      await ordersRepo.insertStatusHistory(inserted.id, "new", null, client);
      return inserted;
    });
  } catch (error) {
    if (error instanceof ReplayConflictError) {
      const winner = await ordersRepo.findByClientRequestId(idempotencyKey);
      if (winner) return replay(winner, table.id);
    }
    throw error;
  }

  emitOrderCreated({
    orderId: order.id,
    restaurantId: order.restaurantId,
    tableId: order.tableId,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
  });

  return { order: await buildCreated(order, restaurant.currency), replayed: false };
}

async function replay(existing: Order, tableId: string): Promise<CreateOrderResult> {
  // A key must never leak an order from another tenant or table.
  if (existing.tableId !== tableId) {
    throw new ConflictError("This Idempotency-Key was already used.");
  }
  const restaurant = await restaurantsRepo.getById(existing.restaurantId);
  if (!restaurant) {
    throw new NotFoundError("Menu not found.");
  }
  return {
    order: await buildCreated(existing, restaurant.currency),
    replayed: true,
  };
}

/** FR-29: only the holder of the tracking token may see the order. */
export async function getPublicOrder(
  id: string,
  trackingToken: string | undefined
): Promise<PublicOrderStatus> {
  if (!trackingToken) {
    throw new NotFoundError("Order not found.");
  }
  const order = await ordersRepo.getByIdWithTrackingHash(id);
  if (!order || !verifyTokenHash(trackingToken, order.trackingTokenHash)) {
    throw new NotFoundError("Order not found.");
  }

  const [restaurant, table, items, history] = await Promise.all([
    restaurantsRepo.getById(order.restaurantId),
    tablesRepo.getById(order.restaurantId, order.tableId),
    ordersRepo.listItems(order.id),
    ordersRepo.listStatusHistoryUnscoped(order.id),
  ]);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    table: { number: table?.tableNumber ?? "" },
    timeline: history.map((entry) => ({ status: entry.status, at: entry.changedAt })),
    items: toPublicLines(items),
    total: order.total,
    currency: restaurant?.currency ?? "PKR",
    createdAt: order.createdAt,
  };
}

export interface OrderListResult {
  orders: KitchenOrder[];
  total: number;
}

/** FR-30 / FR-35: kitchen or owner order board, tenant scoped. */
export async function listOrders(
  restaurantId: string,
  query: OrderListQuery
): Promise<OrderListResult> {
  const statuses = query.status?.length
    ? query.status
    : [...DEFAULT_KITCHEN_STATUSES];

  const page = await ordersRepo.listByStatuses(restaurantId, {
    status: statuses,
    from: query.from ? new Date(query.from) : null,
    to: query.to ? new Date(query.to) : null,
    page: query.page,
    pageSize: query.pageSize,
  });

  const orderIds = page.orders.map((order) => order.id);
  const [itemsByOrder, tableRows] = await Promise.all([
    ordersRepo.listItemsForOrders(orderIds),
    tablesRepo.getManyByIds(
      restaurantId,
      page.orders.map((order) => order.tableId)
    ),
  ]);
  const tableNumber = new Map(tableRows.map((row) => [row.id, row.tableNumber]));

  return {
    orders: page.orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      table: { number: tableNumber.get(order.tableId) ?? "" },
      status: order.status,
      notes: order.notes,
      items: toPublicLines(itemsByOrder.get(order.id) ?? []),
      createdAt: order.createdAt,
    })),
    total: page.total,
  };
}

export interface StatusChangeResult {
  id: string;
  status: Order["status"];
  updatedAt: string;
}

/** FR-33: enforce the state machine and append history in one transaction. */
export async function changeOrderStatus(
  restaurantId: string,
  orderId: string,
  nextStatus: Order["status"],
  changedBy: string
): Promise<StatusChangeResult> {
  const order = await ordersRepo.getById(restaurantId, orderId);
  if (!order) {
    throw new NotFoundError("Order not found.");
  }
  if (!canTransition(order.status, nextStatus)) {
    throw new InvalidStatusTransitionAppError(
      `Cannot move an order from ${order.status} to ${nextStatus}.`
    );
  }

  const updated = await withTransaction(async (client) =>
    ordersRepo.changeStatus(restaurantId, orderId, nextStatus, changedBy, client)
  );
  if (!updated) {
    throw new NotFoundError("Order not found.");
  }

  emitOrderStatusChanged({ orderId, restaurantId, status: updated.status });

  return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt };
}
