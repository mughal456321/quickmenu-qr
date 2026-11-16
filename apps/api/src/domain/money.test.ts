import { describe, expect, it } from "vitest";
import {
  MoneyError,
  add,
  formatMoney,
  fromMinor,
  multiply,
  toMinor,
} from "./money";

describe("money (FR-25)", () => {
  it.each([
    ["0", 0],
    ["0.00", 0],
    ["0.10", 10],
    ["12.5", 1250],
    ["650", 65000],
    ["650.00", 65000],
    ["1450.99", 145099],
    [" 42.42 ", 4242],
  ])("toMinor(%s) === %i", (input, expected) => {
    expect(toMinor(input)).toBe(expected);
  });

  it.each(["1.234", "0.001", "-5", "-0.10", "01.00", "1,000", "abc", "", "10."])(
    "rejects invalid money %s",
    (input) => {
      expect(() => toMinor(input)).toThrow(MoneyError);
    }
  );

  it("reports too many decimals with a specific message", () => {
    expect(() => toMinor("1.234")).toThrow(/at most 2 decimal places/);
  });

  it("fromMinor renders exactly two decimals", () => {
    expect(fromMinor(0)).toBe("0.00");
    expect(fromMinor(5)).toBe("0.05");
    expect(fromMinor(10)).toBe("0.10");
    expect(fromMinor(65000)).toBe("650.00");
    expect(fromMinor(145099)).toBe("1450.99");
    expect(fromMinor(-250)).toBe("-2.50");
  });

  it("rejects non-integer minor units", () => {
    expect(() => fromMinor(1.5)).toThrow(MoneyError);
    expect(() => add(1.5, 1)).toThrow(MoneyError);
    expect(() => multiply(1.5, 2)).toThrow(MoneyError);
  });

  it("adds without floating point drift", () => {
    const a = toMinor("0.10");
    const b = toMinor("0.20");
    expect(add(a, b)).toBe(30);
    expect(fromMinor(add(a, b))).toBe("0.30");
  });

  it("multiplies without floating point drift (3 x 0.10 = 0.30)", () => {
    expect(multiply(toMinor("0.10"), 3)).toBe(30);
    expect(fromMinor(multiply(toMinor("0.10"), 3))).toBe("0.30");
  });

  it("rejects fractional and negative quantities in multiply", () => {
    expect(() => multiply(100, 1.5)).toThrow(MoneyError);
    expect(() => multiply(100, -1)).toThrow(MoneyError);
  });

  it("formats money with the currency code", () => {
    expect(formatMoney(145000, "PKR")).toBe("PKR 1450.00");
  });
});
