import type { OrderStatus } from "@quickmenu/shared";
import { describe, expect, it } from "vitest";
import { allowedNext, canTransition, isTerminal } from "./statusMachine";

const STATUSES: OrderStatus[] = ["new", "preparing", "ready", "served", "cancelled"];

/** docs/03 section 3.6, transcribed as the expected matrix. */
const EXPECTED: Record<OrderStatus, OrderStatus[]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

describe("order state machine (FR-33, docs/03 section 3.6)", () => {
  it("has the documented allowed next statuses", () => {
    for (const status of STATUSES) {
      expect(allowedNext(status)).toEqual(EXPECTED[status]);
    }
  });

  it("evaluates every (from, to) pair against the expected table", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(
          EXPECTED[from].includes(to)
        );
      }
    }
  });

  it("allows exactly the documented number of transitions", () => {
    let allowed = 0;
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (canTransition(from, to)) allowed += 1;
      }
    }
    expect(allowed).toBe(6);
  });

  it("treats served and cancelled as terminal", () => {
    expect(isTerminal("served")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("new")).toBe(false);
    expect(isTerminal("preparing")).toBe(false);
    expect(isTerminal("ready")).toBe(false);
  });

  it("does not allow a status to move to itself", () => {
    for (const status of STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("returns a fresh array so callers cannot mutate the table", () => {
    const first = allowedNext("new");
    first.push("served");
    expect(allowedNext("new")).toEqual(["preparing", "cancelled"]);
  });
});
