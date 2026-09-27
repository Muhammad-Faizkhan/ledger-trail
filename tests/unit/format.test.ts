import { describe, expect, it } from "vitest";
import {
  amountsDiffer, daysBetween, isIsoDate, itemsSummary, money, num, parseNonNegativeNumber, poNumber,
  parsePositiveNumber, round2, today, whatsAppNumber, whatsAppUrl,
} from "@/lib/format";

describe("round2 / money / num", () => {
  it("removes float noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(3 * 0.1)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });

  it("formats money with sign outside the currency", () => {
    expect(money(1234567.891)).toBe("Rs 1,234,567.89");
    expect(money(-50)).toBe("-Rs 50");
    expect(money(0)).toBe("Rs 0");
  });

  it("never renders negative zero", () => {
    expect(money(-0.001)).toBe("Rs 0");
  });

  it("formats plain numbers", () => {
    expect(num(2.5)).toBe("2.5");
    expect(num(0.1 + 0.2)).toBe("0.3");
  });
});

describe("amountsDiffer", () => {
  it("ignores sub-paisa noise", () => {
    expect(amountsDiffer(0.1 + 0.2, 0.3)).toBe(false);
    expect(amountsDiffer(100, 100.004)).toBe(false);
  });
  it("flags a one-paisa difference", () => {
    expect(amountsDiffer(100, 100.01)).toBe(true);
    expect(amountsDiffer(100, 99.99)).toBe(true);
  });
});

describe("dates", () => {
  it("today() uses the local calendar date", () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("daysBetween counts whole days across months, leap years and DST", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-02-10", "2026-02-01")).toBe(-9);
  });

  it("isIsoDate checks shape", () => {
    expect(isIsoDate("2026-09-26")).toBe(true);
    expect(isIsoDate("26-09-2026")).toBe(false);
    expect(isIsoDate("2026-9-26")).toBe(false);
  });
});

describe("whatsAppNumber", () => {
  it.each([
    ["0300-1234567", "923001234567"],
    ["3001234567", "923001234567"],
    ["+92 300 1234567", "923001234567"],
    ["0092 300 1234567", "923001234567"],
    ["+44 20 7946 0958", "442079460958"],
    ["923001234567", "923001234567"],
  ])("%s -> %s", (input, expected) => {
    expect(whatsAppNumber(input)).toBe(expected);
  });

  it.each([null, undefined, "", "   ", "abc", "12345", "1234567890123456"])(
    "rejects %j",
    (input) => {
      expect(whatsAppNumber(input)).toBeNull();
    },
  );

  it("builds an encoded wa.me URL", () => {
    expect(whatsAppUrl("03001234567", "Hi & bye\nx")).toBe(
      "https://wa.me/923001234567?text=Hi%20%26%20bye%0Ax",
    );
    expect(whatsAppUrl("", "hi")).toBeNull();
  });
});

describe("number parsing", () => {
  it("parsePositiveNumber", () => {
    expect(parsePositiveNumber("12.5")).toBe(12.5);
    expect(parsePositiveNumber(" 3 ")).toBe(3);
    for (const v of ["", "  ", "0", "-1", "abc", "Infinity", "NaN"]) {
      expect(parsePositiveNumber(v)).toBeNull();
    }
  });

  it("parseNonNegativeNumber", () => {
    expect(parseNonNegativeNumber("0")).toBe(0);
    expect(parseNonNegativeNumber("7")).toBe(7);
    for (const v of ["", "-0.5", "x", "Infinity"]) {
      expect(parseNonNegativeNumber(v)).toBeNull();
    }
  });
});

describe("order labels", () => {
  it("poNumber pads to 4 digits and keeps growing past 9999", () => {
    expect(poNumber(7)).toBe("PO-0007");
    expect(poNumber(12345)).toBe("PO-12345");
  });

  it("itemsSummary shows two names then a count", () => {
    expect(itemsSummary([])).toBe("—");
    expect(itemsSummary([{ name: "Cement" }])).toBe("Cement");
    expect(itemsSummary([{ name: "Cement" }, { name: "Steel" }])).toBe("Cement, Steel");
    expect(itemsSummary([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }])).toBe("A, B +2 more");
  });
});
