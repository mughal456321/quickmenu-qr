import { EventEmitter } from "events";

/**
 * In-process domain event for menu writes (Phase 04 rule).
 *
 * The Socket.IO layer subscribes in Phase 06 and forwards `menu:updated` to
 * customer menus. Keeping this independent of Socket.IO means services stay
 * free of transport concerns.
 */
export interface MenuChangedEvent {
  restaurantId: string;
  itemId: string;
  isAvailable: boolean;
  deleted?: boolean;
}

const MENU_CHANGED = "menu.changed";
const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function emitMenuChanged(event: MenuChangedEvent): void {
  emitter.emit(MENU_CHANGED, event);
}

export function onMenuChanged(listener: (event: MenuChangedEvent) => void): () => void {
  emitter.on(MENU_CHANGED, listener);
  return () => emitter.off(MENU_CHANGED, listener);
}

/** Test helper: drop listeners between suites. */
export function removeAllMenuListeners(): void {
  emitter.removeAllListeners(MENU_CHANGED);
}
