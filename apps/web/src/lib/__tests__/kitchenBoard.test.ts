import { describe, expect, it } from "vitest";
import type { KitchenOrder } from "@quickmenu/shared";
import {
  applyStatus,
  columnFor,
  countByStatus,
  elapsedMinutes,
  filterBoard,
  mergeOrders,
  primaryAction,
  removeOrder,
  upsertOrder,
} from "../kitchenBoard";

function order(
  id: string,
  status: KitchenOrder["status"],
  createdAt = "2026-11-13T10:00:00.000Z"
): KitchenOrder {
  return {
    id,
    orderNumber: Number(id.replace(/\D/g, "")) || 1,
    table: { number: "5" },
    status,
    notes: null,
    items: [
      {
        name: "Chicken Biryani",
        variant: "Full",
        quantity: 2,
        unitPrice: 650,
      },
    ],
    createdAt,
  };
}

describe("kitchen board (FR-30..FR-34)", () => {
  it("walks the documented one-tap transitions", () => {
    expect(primaryAction("new")).toEqual({
      label: "Start preparing",
      status: "preparing",
    });
    expect(primaryAction("preparing")).toEqual({
      label: "Mark ready",
      status: "ready",
    });
    expect(primaryAction("ready")).toEqual({
      label: "Mark served",
      status: "served",
    });
    expect(primaryAction("served")).toBeNull();
    expect(primaryAction("cancelled")).toBeNull();
  });

  it("adds a new ticket once and replaces it on reconnect (no duplicates)", () => {
    const first = upsertOrder([], order("1", "new"));
    const duplicate = upsertOrder(first, order("1", "new"));
    expect(duplicate).toHaveLength(1);

    const synced = mergeOrders(
      [order("1", "new"), order("2", "preparing")],
      [order("1", "preparing"), order("3", "ready")]
    );
    expect(synced.map((entry) => entry.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("moves a card between columns and removes it on request", () => {
    const initial = [order("1", "new")];
    const preparing = applyStatus(initial, "1", "preparing");
    expect(preparing[0]!.status).toBe("preparing");
    expect(removeOrder(preparing, "1")).toEqual([]);
  });

  it("counts active columns and filters by tab", () => {
    const orders = [
      order("1", "new"),
      order("2", "new"),
      order("3", "preparing"),
      order("4", "ready"),
      order("5", "served"),
    ];
    expect(countByStatus(orders)).toEqual({ new: 2, preparing: 1, ready: 1 });
    expect(filterBoard(orders, "new")).toHaveLength(2);
    expect(filterBoard(orders, "all")).toHaveLength(5);
  });

  it("keeps served cards in their previous column for the clear delay", () => {
    expect(columnFor(order("1", "served"), "preparing")).toBe("preparing");
    expect(columnFor(order("1", "new"))).toBe("new");
  });

  it("computes elapsed minutes for the card", () => {
    const createdAt = "2026-11-13T10:00:00.000Z";
    const now = new Date("2026-11-13T10:07:30.000Z").getTime();
    expect(elapsedMinutes(createdAt, now)).toBe(7);
    expect(elapsedMinutes("not-a-date", now)).toBe(0);
  });
});
