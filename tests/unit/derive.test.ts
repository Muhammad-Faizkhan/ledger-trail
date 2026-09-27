import { describe, expect, it } from "vitest";
import {
  allocatePayments, audit, methodLabel, orderBalance, orderMessage, recentActivity,
  totalOutstanding, vendorStatement, vendorTotals,
} from "@/lib/derive";
import type { Order, OrderItem, Payment, Vendor } from "@/lib/types";

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Order["createdAt"];

const item = (i: Partial<OrderItem> = {}): OrderItem => ({
  name: "Steel rods", qty: 1, rate: 100, amount: 100, ...i,
});

function order(o: Partial<Order> & Pick<Order, "id">): Order {
  return {
    number: 1, vendorId: "v1", vendorName: "Acme", items: [item()], amount: 100,
    orderDate: "2026-09-01", expectedDate: null, status: "ordered", invoiceAmount: null,
    invoiceNo: null, invoiceDate: null, note: "", createdAt: null, ...o,
  };
}

function payment(p: Partial<Payment> & Pick<Payment, "id">): Payment {
  return {
    orderId: null, vendorId: "v1", vendorName: "Acme", amount: 50, method: "cash", date: "2026-09-02",
    bankAccount: null, bankRef: null, chequeNo: null, chequeBank: null, chequeDate: null,
    clearedStatus: null, clearedDate: null, cashTo: null, createdAt: null, ...p,
  };
}

const vendor: Vendor = { id: "v1", name: "Acme", phone: "03001234567", notes: "", createdAt: null };

describe("allocatePayments", () => {
  const bal = (orders: Order[], payments: Payment[]) => {
    const a = allocatePayments(orders, payments);
    return Object.fromEntries(orders.map((o) => [o.id, orderBalance(o, a)]));
  };

  it("account payments clear the oldest orders first", () => {
    const orders = [
      order({ id: "new", number: 3, orderDate: "2026-09-10", amount: 300 }),
      order({ id: "old", number: 1, orderDate: "2026-09-01", amount: 100 }),
      order({ id: "mid", number: 2, orderDate: "2026-09-01", amount: 200 }),
    ];
    const a = allocatePayments(orders, [payment({ id: "p1", amount: 250 })]);
    expect(orderBalance(orders[1], a)).toBe(0);
    expect(orderBalance(orders[2], a)).toBe(50);
    expect(orderBalance(orders[0], a)).toBe(300);
    expect(a.applied).toEqual([
      { paymentId: "p1", orderId: "old", amount: 100 },
      { paymentId: "p1", orderId: "mid", amount: 150 },
    ]);
    expect(a.byOrder.get("mid")).toEqual({ paid: 150, balance: 50 });
    expect(a.credit.size).toBe(0);
  });

  it("older payments are applied before newer ones", () => {
    const orders = [order({ id: "o1", amount: 100 }), order({ id: "o2", number: 2, amount: 100 })];
    const a = allocatePayments(orders, [
      payment({ id: "later", date: "2026-09-05", amount: 100 }),
      payment({ id: "earlier", date: "2026-09-03", amount: 60 }),
    ]);
    expect(a.applied).toEqual([
      { paymentId: "earlier", orderId: "o1", amount: 60 },
      { paymentId: "later", orderId: "o1", amount: 40 },
      { paymentId: "later", orderId: "o2", amount: 60 },
    ]);
  });

  it("a pinned payment pays its own order first, even if it isn't the oldest", () => {
    const orders = [
      order({ id: "old", amount: 100 }),
      order({ id: "pinned", number: 2, orderDate: "2026-09-05", amount: 100 }),
    ];
    // The account payment is older, but the pinned one has already covered its order.
    expect(bal(orders, [
      payment({ id: "acct", date: "2026-09-02", amount: 150 }),
      payment({ id: "pin", orderId: "pinned", date: "2026-09-06", amount: 100 }),
    ])).toEqual({ old: 0, pinned: 0 });

    const a = allocatePayments(orders, [payment({ id: "pin", orderId: "pinned", amount: 40 }), payment({ id: "acct", amount: 30 })]);
    expect(a.byOrder.get("pinned")).toEqual({ paid: 40, balance: 60 });
    expect(a.byOrder.get("old")).toEqual({ paid: 30, balance: 70 });
  });

  it("the unused part of a pinned payment goes to the oldest other orders", () => {
    const orders = [
      order({ id: "old", amount: 100 }),
      order({ id: "pinned", number: 2, orderDate: "2026-09-05", amount: 100 }),
    ];
    const a = allocatePayments(orders, [payment({ id: "pin", orderId: "pinned", amount: 150 })]);
    expect(a.applied).toEqual([
      { paymentId: "pin", orderId: "pinned", amount: 100 },
      { paymentId: "pin", orderId: "old", amount: 50 },
    ]);
  });

  it("overpayment becomes credit with that vendor", () => {
    const orders = [order({ id: "o1", amount: 100 })];
    const a = allocatePayments(orders, [
      payment({ id: "p1", amount: 80 }),
      payment({ id: "p2", amount: 70 }),
    ]);
    expect(a.byOrder.get("o1")).toEqual({ paid: 100, balance: 0 });
    expect(a.credit.get("v1")).toBe(50);
  });

  it("a payment with no orders yet is all credit", () => {
    const a = allocatePayments([], [payment({ id: "p1", amount: 500 })]);
    expect(a.applied).toEqual([]);
    expect(a.credit.get("v1")).toBe(500);
  });

  it("a payment pinned to a deleted order counts against the account", () => {
    const orders = [order({ id: "o2", amount: 100 })];
    const a = allocatePayments(orders, [payment({ id: "p1", orderId: "deleted", amount: 60 })]);
    expect(a.byOrder.get("o2")).toEqual({ paid: 60, balance: 40 });
  });

  it("never mixes vendors", () => {
    const orders = [order({ id: "a1", amount: 100 }), order({ id: "b1", vendorId: "v2", amount: 100 })];
    const a = allocatePayments(orders, [
      payment({ id: "p1", vendorId: "v2", amount: 150 }),
      // Pinned across vendors (shouldn't happen): treated as an account payment for its own vendor.
      payment({ id: "p2", orderId: "b1", vendorId: "v1", amount: 30 }),
    ]);
    expect(a.byOrder.get("a1")).toEqual({ paid: 30, balance: 70 });
    expect(a.byOrder.get("b1")).toEqual({ paid: 100, balance: 0 });
    expect(a.credit.get("v2")).toBe(50);
    expect(a.credit.has("v1")).toBe(false);
  });

  it("has no float drift", () => {
    const orders = [order({ id: "o1", amount: 0.3 })];
    const a = allocatePayments(orders, [payment({ id: "p1", amount: 0.1 }), payment({ id: "p2", amount: 0.2 })]);
    expect(a.byOrder.get("o1")).toEqual({ paid: 0.3, balance: 0 });
    expect(a.credit.size).toBe(0);
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
    payment({ id: "p3", vendorId: "v3", amount: 10 }),
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

  it("lists unpaid orders older than 30 days, oldest first, after account payments", () => {
    const r = audit(
      [
        order({ id: "exactly30", number: 4, orderDate: "2026-08-27" }),
        order({ id: "31", number: 3, orderDate: "2026-08-26" }),
        order({ id: "60", number: 2, orderDate: "2026-07-28" }),
        order({ id: "paidOff", number: 1, orderDate: "2026-07-01" }),
      ],
      [payment({ id: "p", amount: 150 })],
      asOf,
    );
    expect(r.overdue.map((x) => [x.order.id, x.days, x.balance])).toEqual([
      ["60", 60, 50],
      ["31", 31, 100],
    ]);
  });

  it("lists orders not received by their expected date", () => {
    const r = audit(
      [
        order({ id: "late", expectedDate: "2026-09-20" }),
        order({ id: "today", expectedDate: asOf }),
        order({ id: "arrived", expectedDate: "2026-09-01", status: "received" }),
        order({ id: "noDate" }),
      ],
      [],
      asOf,
    );
    expect(r.lateDeliveries.map((x) => [x.order.id, x.days])).toEqual([["late", 6]]);
  });

  it("tracks pending and stale cheques by cheque date, falling back to payment date", () => {
    const r = audit(
      [order({ id: "o1" })],
      [
        payment({ id: "cleared", method: "cheque", chequeDate: "2026-01-01", clearedStatus: "cleared" }),
        payment({ id: "fresh", method: "cheque", chequeDate: "2026-09-19", clearedStatus: "issued" }),
        payment({ id: "stale", method: "cheque", chequeDate: "2026-09-10", date: "2026-09-25", clearedStatus: "issued" }),
        payment({ id: "noDate", method: "cheque", chequeDate: null, date: "2026-09-01" }),
        payment({ id: "cash", method: "cash", date: "2026-01-01" }),
      ],
      asOf,
    );
    expect(r.pendingCheques.map((p) => p.id)).toEqual(["fresh", "stale", "noDate"]);
    expect(r.staleCheques.map((x) => [x.payment.id, x.days])).toEqual([
      ["noDate", 25],
      ["stale", 16],
    ]);
  });
});

describe("recentActivity", () => {
  it("merges orders and payments newest first, pending writes on top, with a limit", () => {
    const items = recentActivity(
      [
        order({ id: "o1", createdAt: ts(100) }),
        order({ id: "o2", number: 12, createdAt: ts(300), items: [item({ name: "Cement" }), item(), item(), item()] }),
      ],
      [
        payment({ id: "p1", createdAt: ts(200) }),
        payment({ id: "p2", createdAt: null, method: "cash", cashTo: "Ali" }),
      ],
      3,
    );
    expect(items.map((i) => [i.kind, i.id])).toEqual([
      ["payment", "p2"],
      ["order", "o2"],
      ["payment", "p1"],
    ]);
    expect(items[0].label).toBe("Cash to Ali");
    expect(items[1].label).toBe("PO-0012 · Cement, Steel rods +2 more");
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
    expect(methodLabel(payment({ id: "p", ...p }))).toBe(expected);
  });
});

describe("messages", () => {
  it("orderMessage lists every item", () => {
    const o = order({
      id: "o1", number: 7, amount: 72_800.3, expectedDate: "2026-09-30", note: "Deliver to site 2",
      items: [
        item({ name: "Cement", qty: 50, rate: 1450, amount: 72_500 }),
        item({ name: "Binding wire", qty: 3, rate: 100.1, amount: 300.3 }),
      ],
    });
    expect(orderMessage(o, "Faiz Traders")).toBe(
      [
        "*Purchase order PO-0007*",
        "From: Faiz Traders",
        "Date: 2026-09-01",
        "Deliver by: 2026-09-30",
        "",
        "1. Cement — 50 × Rs 1,450 = Rs 72,500",
        "2. Binding wire — 3 × Rs 100.1 = Rs 300.3",
        "",
        "*Total: Rs 72,800.3*",
        "Note: Deliver to site 2",
      ].join("\n"),
    );
    const plain = orderMessage(order({ id: "o2" }), "");
    expect(plain).toContain("From: —");
    expect(plain).not.toContain("Deliver by");
    expect(plain).not.toContain("Note:");
  });

  it("vendorStatement lists only this vendor's entries in date order", () => {
    const orders = [
      order({
        id: "o2", number: 2, orderDate: "2026-09-10", amount: 100, invoiceAmount: 110,
        invoiceNo: "B-9", invoiceDate: "2026-09-11",
        items: [item({ name: "Bricks", qty: 2, rate: 50, amount: 100 })],
      }),
      order({
        id: "o1", number: 1, orderDate: "2026-09-01", amount: 200, invoiceAmount: 200,
        items: [item({ name: "Cement", qty: 1, rate: 200, amount: 200 })],
      }),
      order({ id: "ox", vendorId: "v2" }),
    ];
    const payments = [
      payment({ id: "p2", date: "2026-09-05", method: "cheque", chequeNo: "7", amount: 100, clearedStatus: "issued" }),
      payment({ id: "p1", orderId: "o1", date: "2026-09-02", method: "bank", bankRef: "R1", amount: 50 }),
      payment({ id: "px", vendorId: "v2", amount: 999 }),
    ];
    expect(vendorStatement(vendor, orders, payments, "Faiz Traders", "2026-09-26")).toBe(
      [
        "*Statement: Acme*",
        "From: Faiz Traders",
        "As of: 2026-09-26",
        "",
        "*Orders*",
        "2026-09-01 · PO-0001 · Rs 200 (ordered)",
        "   Cement: 1 × Rs 200",
        "   Bill: Rs 200",
        "2026-09-10 · PO-0002 · Rs 100 (ordered)",
        "   Bricks: 2 × Rs 50",
        "   Bill #B-9: Rs 110 on 2026-09-11 ⚠ differs from order",
        "Total ordered: Rs 300",
        "",
        "*Payments*",
        "2026-09-02 · Bank transfer (ref R1) · Rs 50",
        "2026-09-05 · Cheque #7 · Rs 100 (not yet cleared)",
        "Total paid: Rs 150",
        "",
        "*Balance due: Rs 150*",
      ].join("\n"),
    );
  });

  it("vendorStatement with no activity, and with an advance", () => {
    const s = vendorStatement(vendor, [], [], "", "2026-09-26");
    expect(s).toContain("From: —");
    expect(s).toContain("*Orders*\nNone");
    expect(s).toContain("*Payments*\nNone");
    expect(s).toContain("*Balance due: Rs 0*");
    expect(vendorStatement(vendor, [], [payment({ id: "p", amount: 500 })], "", "2026-09-26"))
      .toContain("*Paid in advance: Rs 500*");
  });
});
