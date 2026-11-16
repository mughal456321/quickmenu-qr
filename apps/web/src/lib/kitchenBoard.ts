import type { KitchenOrder, OrderStatus } from "@quickmenu/shared";

/**
 * Kitchen board helpers (Phase 09, FR-30..FR-34).
 *
 * The board only shows the three active columns. Served and cancelled orders
 * stay on screen for ten seconds so staff see the confirmation, then disappear.
 */
export const BOARD_COLUMNS = ["new", "preparing", "ready"] as const;

export type BoardStatus = (typeof BOARD_COLUMNS)[number];

export type BoardFilter = "all" | BoardStatus;

export interface PrimaryAction {
  label: string;
  status: OrderStatus;
}

const PRIMARY_ACTIONS: Record<BoardStatus, PrimaryAction> = {
  new: { label: "Start preparing", status: "preparing" },
  preparing: { label: "Mark ready", status: "ready" },
  ready: { label: "Mark served", status: "served" },
};

export function isBoardStatus(status: OrderStatus): status is BoardStatus {
  return (BOARD_COLUMNS as readonly OrderStatus[]).includes(status);
}

/** The single next step for a card, or null when nothing is left to do. */
export function primaryAction(status: OrderStatus): PrimaryAction | null {
  return isBoardStatus(status) ? PRIMARY_ACTIONS[status] : null;
}

export function elapsedMinutes(createdAt: string, nowMs = Date.now()): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((nowMs - created) / 60_000));
}

/** Insert or replace by id so reconnects never create duplicate cards. */
export function upsertOrder(
  orders: KitchenOrder[],
  incoming: KitchenOrder
): KitchenOrder[] {
  const index = orders.findIndex((order) => order.id === incoming.id);
  if (index === -1) return [...orders, incoming];
  const next = [...orders];
  next[index] = incoming;
  return next;
}

/** Merge a `kot:sync` snapshot without dropping local-only rows twice. */
export function mergeOrders(
  current: KitchenOrder[],
  snapshot: KitchenOrder[]
): KitchenOrder[] {
  const byId = new Map<string, KitchenOrder>();
  for (const order of current) byId.set(order.id, order);
  for (const order of snapshot) byId.set(order.id, order);
  return [...byId.values()];
}

/** Apply an `order:status` event to the local board. */
export function applyStatus(
  orders: KitchenOrder[],
  orderId: string,
  status: OrderStatus
): KitchenOrder[] {
  return orders.map((order) =>
    order.id === orderId ? { ...order, status } : order
  );
}

export function removeOrder(
  orders: KitchenOrder[],
  orderId: string
): KitchenOrder[] {
  return orders.filter((order) => order.id !== orderId);
}

export function filterBoard(
  orders: KitchenOrder[],
  filter: BoardFilter
): KitchenOrder[] {
  return filter === "all"
    ? orders
    : orders.filter((order) => order.status === filter);
}

export function countByStatus(
  orders: KitchenOrder[]
): Record<BoardStatus, number> {
  const counts: Record<BoardStatus, number> = {
    new: 0,
    preparing: 0,
    ready: 0,
  };
  for (const order of orders) {
    if (isBoardStatus(order.status)) counts[order.status] += 1;
  }
  return counts;
}

/** Column an order belongs to; served/cancelled keep their last column. */
export function columnFor(
  order: KitchenOrder,
  previous?: BoardStatus
): BoardStatus {
  return isBoardStatus(order.status) ? order.status : previous ?? "ready";
}

/** Served and cancelled cards leave the board after this delay. */
export const CLEAR_DELAY_MS = 10_000;

/** Poll while the socket is down (FR-34, NFR-R3). */
export const POLL_INTERVAL_MS = 5_000;
