import { describe, expect, it } from "vitest";
import {
  audit, methodLabel, orderBalance, orderMessage, paidByOrder, paymentsByOrder,
  recentActivity, totalOutstanding, vendorStatement, vendorTotals,
} from "@/lib/derive";
import type { Order, Payment, Vendor } from "@/lib/types";

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Order["createdAt"];

function order(o: Partial<Order> & Pick<Order, "id">): Order {
  return {
    vendorId: "v1", vendorName: "Acme", description: "Steel rods", qty: 1, rate: 100,
    amount: 100, orderDate: "2026-09-01", status: "ordered", invoiceAmount: null,
    invoiceDate: null, createdAt: null, ...o,
  };
}

function payment(p: Partial<Payment> & Pick<Payment, "id" | "orderId">): Payment {
  return {
    vendorId: "v1", vendorName: "Acme", amount: 50, method: "cash", date: "2026-09-02",
    bankAccount: null, bankRef: null, chequeNo: null, chequeBank: null, chequeDate: null,
    clearedStatus: null, clearedDate: null, cashTo: null, createdAt: null, ...p,
  };
}

const vendor: Vendor = { id: "v1", name: "Acme", phone: "03001234567", notes: "", createdAt: null };

describe("per-order payments", () => {
  const payments = [
    payment({ id: "p1", orderId: "o1", amount: 0.1 }),
    payment({ id: "p2", orderId: "o1", amount: 0.2 }),
    payment({ id: "p3", orderId: "o2", amount: 5 }),
  ];

  it("paidByOrder sums per order", () => {
    const m = paidByOrder(payments);
    expect(m.get("o1")).toBeCloseTo(0.3);
    expect(m.get("o2")).toBe(5);
    expect(m.has("o3")).toBe(false);
  });

  it("paymentsByOrder groups in input order", () => {
    const m = paymentsByOrder(payments);
    expect(m.get("o1")!.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(m.get("o2")!.map((p) => p.id)).toEqual(["p3"]);
  });

  it("orderBalance is rounded and handles unpaid orders", () => {
    const paid = paidByOrder(payments);
    expect(orderBalance(order({ id: "o1", amount: 0.3 }), paid)).toBe(0);
    expect(orderBalance(order({ id: "o3", amount: 42 }), paid)).toBe(42);
    expect(orderBalance(order({ id: "o2", amount: 4 }), paid)).toBe(-1);
  });
});

describe("totals", () => {
  const orders = [
    order({ id: "o1", amount: 100 }),
    order({ id: "o2", amount: 0.1 }),
    order({ id: "o3", vendorId: "v2", amount: 0.2 }),
  ];
  const payments = [
    payment({ id: "p1", orderId: "o1", amount: 60 }),
    payment({ id: "p2", orderId: "o3", vendorId: "v2", amount: 0.2 }),
    payment({ id: "p3", orderId: "x", vendorId: "v3", amount: 10 }),
  ];

  it("vendorTotals per vendor, including payment-only vendors", () => {
    const m = vendorTotals(orders, payments);
    expect(m.get("v1")).toEqual({ ordered: 100.1, paid: 60, outstanding: 40.1 });
    expect(m.get("v2")).toEqual({ ordered: 0.2, paid: 0.2, outstanding: 0 });
    expect(m.get("v3")).toEqual({ ordered: 0, paid: 10, outstanding: -10 });
  });

  it("totalOutstanding across everything", () => {
    expect(totalOutstanding(orders, payments)).toBe(30.1);
    expect(totalOutstanding([], [])).toBe(0);
  });
});

describe("audit", () => {
  const asOf = "2026-09-26";

  it("flags invoice mismatches beyond a paisa only", () => {
    const r = audit(
      [
        order({ id: "ok", amount: 0.3, invoiceAmount: 0.1 + 0.2 }),
        order({ id: "bad", amount: 100, invoiceAmount: 100.5 }),
        order({ id: "none", amount: 100, invoiceAmount: null }),
      ],
      [],
      asOf,
    );
    expect(r.mismatches.map((o) => o.id)).toEqual(["bad"]);
  });

  it("lists unpaid orders older than 30 days, oldest first", () => {
    const r = audit(
      [
        order({ id: "exactly30", orderDate: "2026-08-27" }),
        order({ id: "31", orderDate: "2026-08-26" }),
        order({ id: "60", orderDate: "2026-07-28" }),
        order({ id: "paidOff", orderDate: "2026-07-01" }),
      ],
      [payment({ id: "p", orderId: "paidOff", amount: 100 })],
      asOf,
    );
    expect(r.overdue.map((x) => [x.order.id, x.days, x.balance])).toEqual([
      ["60", 60, 100],
      ["31", 31, 100],
    ]);
  });

  it("tracks pending and stale cheques by cheque date, falling back to payment date", () => {
    const r = audit(
      [order({ id: "o1" })],
      [
        payment({ id: "cleared", orderId: "o1", method: "cheque", chequeDate: "2026-01-01", clearedStatus: "cleared" }),
        payment({ id: "fresh", orderId: "o1", method: "cheque", chequeDate: "2026-09-19", clearedStatus: "issued" }),
        payment({ id: "stale", orderId: "o1", method: "cheque", chequeDate: "2026-09-10", date: "2026-09-25", clearedStatus: "issued" }),
        payment({ id: "noDate", orderId: "o1", method: "cheque", chequeDate: null, date: "2026-09-01" }),
        payment({ id: "cash", orderId: "o1", method: "cash", date: "2026-01-01" }),
      ],
      asOf,
    );
    expect(r.pendingCheques.map((p) => p.id)).toEqual(["fresh", "stale", "noDate"]);
    expect(r.staleCheques.map((x) => [x.payment.id, x.days])).toEqual([
      ["noDate", 25],
      ["stale", 16],
    ]);
  });

  it("finds payments whose order no longer exists", () => {
    const r = audit([order({ id: "o1" })], [
      payment({ id: "p1", orderId: "o1" }),
      payment({ id: "p2", orderId: "gone" }),
    ], asOf);
    expect(r.orphanPayments.map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("recentActivity", () => {
  it("merges orders and payments newest first, pending writes on top, with a limit", () => {
    const items = recentActivity(
      [order({ id: "o1", createdAt: ts(100) }), order({ id: "o2", createdAt: ts(300) })],
      [
        payment({ id: "p1", orderId: "o1", createdAt: ts(200) }),
        payment({ id: "p2", orderId: "o1", createdAt: null, method: "cash", cashTo: "Ali" }),
      ],
      3,
    );
    expect(items.map((i) => [i.kind, i.id])).toEqual([
      ["payment", "p2"],
      ["order", "o2"],
      ["payment", "p1"],
    ]);
    expect(items[0].label).toBe("Cash to Ali");
  });

  it("defaults to 8 items", () => {
    const orders = Array.from({ length: 10 }, (_, i) => order({ id: `o${i}`, createdAt: ts(i) }));
    expect(recentActivity(orders, [])).toHaveLength(8);
  });
});

describe("methodLabel", () => {
  it.each([
    [{ method: "bank", bankRef: "TX9" }, "Bank transfer (ref TX9)"],
    [{ method: "bank" }, "Bank transfer"],
    [{ method: "cheque", chequeNo: "123", chequeBank: "HBL" }, "Cheque #123 HBL"],
    [{ method: "cheque" }, "Cheque #?"],
    [{ method: "cash", cashTo: "Ali" }, "Cash to Ali"],
    [{ method: "cash" }, "Cash"],
  ] as [Partial<Payment>, string][])("%j", (p, expected) => {
    expect(methodLabel(payment({ id: "p", orderId: "o", ...p }))).toBe(expected);
  });
});

describe("messages", () => {
  it("orderMessage", () => {
    const o = order({ id: "o1", description: "Cement", qty: 3, rate: 0.1, amount: 0.3, status: "confirmed" });
    expect(orderMessage(o, "Faiz Traders")).toBe(
      [
        "*Order from Faiz Traders*",
        "Item: Cement",
        "Qty: 3 × Rs 0.1 = Rs 0.3",
        "Order date: 2026-09-01",
        "Status: confirmed",
      ].join("\n"),
    );
    expect(orderMessage(o, "")).toContain("*Order from us*");
  });

  it("vendorStatement lists only this vendor's entries in date order", () => {
    const orders = [
      order({ id: "o2", orderDate: "2026-09-10", description: "Bricks", qty: 2, rate: 50, amount: 100, invoiceAmount: 110, invoiceDate: "2026-09-11" }),
      order({ id: "o1", orderDate: "2026-09-01", description: "Cement", qty: 1, rate: 200, amount: 200, invoiceAmount: 200 }),
      order({ id: "ox", vendorId: "v2", description: "Other vendor" }),
    ];
    const payments = [
      payment({ id: "p2", orderId: "o1", date: "2026-09-05", method: "cheque", chequeNo: "7", amount: 100, clearedStatus: "issued" }),
      payment({ id: "p1", orderId: "o1", date: "2026-09-02", method: "bank", bankRef: "R1", amount: 50 }),
      payment({ id: "px", orderId: "ox", vendorId: "v2", amount: 999 }),
    ];
    expect(vendorStatement(vendor, orders, payments, "Faiz Traders", "2026-09-26")).toBe(
      [
        "*Statement: Acme*",
        "From: Faiz Traders",
        "As of: 2026-09-26",
        "",
        "*Orders*",
        "2026-09-01 · Cement",
        "   1 × Rs 200 = Rs 200 (ordered)",
        "   Invoice: Rs 200",
        "2026-09-10 · Bricks",
        "   2 × Rs 50 = Rs 100 (ordered)",
        "   Invoice: Rs 110 on 2026-09-11 ⚠ differs from order",
        "Total ordered: Rs 300",
        "",
        "*Payments*",
        "2026-09-02 · Bank transfer (ref R1) · Rs 50",
        "2026-09-05 · Cheque #7 · Rs 100 (not yet cleared)",
        "Total paid: Rs 150",
        "",
        "*Outstanding balance: Rs 150*",
      ].join("\n"),
    );
  });

  it("vendorStatement with no activity", () => {
    const s = vendorStatement(vendor, [], [], "", "2026-09-26");
    expect(s).toContain("From: —");
    expect(s).toContain("*Orders*\nNone");
    expect(s).toContain("*Payments*\nNone");
    expect(s).toContain("*Outstanding balance: Rs 0*");
  });
});
