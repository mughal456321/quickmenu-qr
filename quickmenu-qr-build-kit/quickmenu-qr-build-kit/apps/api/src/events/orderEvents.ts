import type { OrderStatus } from "@quickmenu/shared";

/**
 * Phase 06 seam for real-time updates. Phase 07 replaces the no-op instance
 * with a Socket.IO emitter; nothing else in the order service changes.
 */
export interface OrderCreatedEvent {
  orderId: string;
  restaurantId: string;
  tableId: string;
  orderNumber: number;
  status: OrderStatus;
  total: number;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  restaurantId: string;
  status: OrderStatus;
}

export interface OrderEvents {
  orderCreated(event: OrderCreatedEvent): void | Promise<void>;
  orderStatusChanged(event: OrderStatusChangedEvent): void | Promise<void>;
}

export const noopOrderEvents: OrderEvents = {
  orderCreated() {
    /* Real-time is out of scope for phase 06 (docs/02 section 6). */
  },
  orderStatusChanged() {
    /* Real-time is out of scope for phase 06 (docs/02 section 6). */
  },
};

let current: OrderEvents = noopOrderEvents;

export function getOrderEvents(): OrderEvents {
  return current;
}

/** Test / phase 07 hook; pass `null` to restore the no-op implementation. */
export function setOrderEvents(events: OrderEvents | null): void {
  current = events ?? noopOrderEvents;
}

export function emitOrderCreated(event: OrderCreatedEvent): void {
  void current.orderCreated(event);
}

export function emitOrderStatusChanged(event: OrderStatusChangedEvent): void {
  void current.orderStatusChanged(event);
}
