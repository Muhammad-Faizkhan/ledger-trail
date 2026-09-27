// Pure derived views over stored data. Every figure the UI shows comes from
// here (or straight from stored fields) — nothing is re-typed.
import { amountsDiffer, daysBetween, itemsSummary, money, num, poNumber, round2 } from "./format";
import type { Order, Payment, Vendor } from "./types";

export const OVERDUE_DAYS = 30;
export const STALE_CHEQUE_DAYS = 7;

const paisa = (n: number) => Math.round(n * 100);
const rupees = (p: number) => p / 100;

/** Oldest first: by order date, then PO number. */
export const byOrderAge = (a: Order, b: Order) =>
  a.orderDate.localeCompare(b.orderDate) || a.number - b.number;

// A write still waiting for its server timestamp is the newest thing there is.
const millis = (t: { toMillis(): number } | null) => (t ? t.toMillis() : Number.MAX_SAFE_INTEGER);

/** Oldest first: by payment date, then when it was recorded. */
export const byPaymentAge = (a: Payment, b: Payment) =>
  a.date.localeCompare(b.date) || millis(a.createdAt) - millis(b.createdAt) || a.id.localeCompare(b.id);

export interface OrderPaid {
  paid: number;
  /** What's still owed on this order; never below 0 (extra money becomes vendor credit). */
  balance: number;
}

export interface Applied {
  paymentId: string;
  orderId: string;
  amount: number;
}

export interface Allocation {
  byOrder: Map<string, OrderPaid>;
  /** Which order each part of each payment went to, in the order it was applied. */
  applied: Applied[];
  /** Paid to a vendor beyond everything ordered from them (an advance). */
  credit: Map<string, number>;
}

/**
 * Works out which orders each payment pays off. Nothing here is stored, so it
 * can't go out of sync after an edit or a delete.
 *
 * 1. A payment pinned to an order pays that order first.
 * 2. Everything else (account payments, plus whatever a pinned payment had left
 *    over) pays that vendor's oldest unpaid orders, oldest payment first.
 * 3. Anything still left is credit with the vendor.
 *
 * A payment pinned to an order that no longer exists counts as an account payment.
 */
export function allocatePayments(orders: Order[], payments: Payment[]): Allocation {
  const owed = new Map(orders.map((o) => [o.id, paisa(o.amount)]));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const sortedPayments = [...payments].sort(byPaymentAge);
  const left = new Map(sortedPayments.map((p) => [p.id, paisa(p.amount)]));
  const applied: Applied[] = [];

  const apply = (p: Payment, orderId: string) => {
    const x = Math.min(left.get(p.id)!, owed.get(orderId)!);
    if (x <= 0) return;
    left.set(p.id, left.get(p.id)! - x);
    owed.set(orderId, owed.get(orderId)! - x);
    const last = applied.at(-1);
    if (last && last.paymentId === p.id && last.orderId === orderId) last.amount += x;
    else applied.push({ paymentId: p.id, orderId, amount: x });
  };

  for (const p of sortedPayments) {
    const o = p.orderId ? orderById.get(p.orderId) : undefined;
    if (o && o.vendorId === p.vendorId) apply(p, o.id);
  }

  const ordersByVendor = new Map<string, Order[]>();
  for (const o of [...orders].sort(byOrderAge)) {
    const list = ordersByVendor.get(o.vendorId);
    if (list) list.push(o);
    else ordersByVendor.set(o.vendorId, [o]);
  }

  const credit = new Map<string, number>();
  for (const p of sortedPayments) {
    for (const o of ordersByVendor.get(p.vendorId) ?? []) {
      if (left.get(p.id)! <= 0) break;
      apply(p, o.id);
    }
    const rest = left.get(p.id)!;
    if (rest > 0) credit.set(p.vendorId, (credit.get(p.vendorId) ?? 0) + rest);
  }

  const byOrder = new Map<string, OrderPaid>();
  for (const o of orders) {
    const balance = owed.get(o.id)!;
    byOrder.set(o.id, { paid: rupees(paisa(o.amount) - balance), balance: rupees(balance) });
  }
  for (const a of applied) a.amount = rupees(a.amount);
  for (const [v, c] of credit) credit.set(v, rupees(c));
  return { byOrder, applied, credit };
}

export function orderBalance(order: Order, alloc: Allocation): number {
  return alloc.byOrder.get(order.id)?.balance ?? order.amount;
}

export interface VendorTotals {
  ordered: number;
  paid: number;
  /** Ordered minus paid. Below 0 means you've paid the vendor in advance. */
  outstanding: number;
}

export function vendorTotals(orders: Order[], payments: Payment[]): Map<string, VendorTotals> {
  const m = new Map<string, VendorTotals>();
  const get = (id: string) => {
    let t = m.get(id);
    if (!t) m.set(id, (t = { ordered: 0, paid: 0, outstanding: 0 }));
    return t;
  };
  for (const o of orders) get(o.vendorId).ordered += o.amount;
  for (const p of payments) get(p.vendorId).paid += p.amount;
  for (const t of m.values()) {
    t.ordered = round2(t.ordered);
    t.paid = round2(t.paid);
    t.outstanding = round2(t.ordered - t.paid);
  }
  return m;
}

export function totalOutstanding(orders: Order[], payments: Payment[]): number {
  const ordered = orders.reduce((s, o) => s + o.amount, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return round2(ordered - paid);
}

export interface OverdueOrder {
  order: Order;
  balance: number;
  days: number;
}

export interface LateDelivery {
  order: Order;
  days: number;
}

export interface StaleCheque {
  payment: Payment;
  days: number;
}

export interface AuditReport {
  mismatches: Order[];
  overdue: OverdueOrder[];
  lateDeliveries: LateDelivery[];
  staleCheques: StaleCheque[];
  pendingCheques: Payment[];
}

export function audit(orders: Order[], payments: Payment[], asOf: string): AuditReport {
  const alloc = allocatePayments(orders, payments);

  const mismatches = orders.filter(
    (o) => o.invoiceAmount != null && amountsDiffer(o.invoiceAmount, o.amount),
  );

  const overdue = orders
    .map((order) => ({
      order,
      balance: orderBalance(order, alloc),
      days: daysBetween(order.orderDate, asOf),
    }))
    .filter((x) => x.balance > 0 && x.days > OVERDUE_DAYS)
    .sort((a, b) => b.days - a.days);

  const lateDeliveries = orders
    .filter((o) => o.status !== "received" && o.expectedDate != null && o.expectedDate < asOf)
    .map((order) => ({ order, days: daysBetween(order.expectedDate!, asOf) }))
    .sort((a, b) => b.days - a.days);

  const pendingCheques = payments.filter(
    (p) => p.method === "cheque" && p.clearedStatus !== "cleared",
  );

  const staleCheques = pendingCheques
    .map((payment) => ({ payment, days: daysBetween(payment.chequeDate ?? payment.date, asOf) }))
    .filter((x) => x.days > STALE_CHEQUE_DAYS)
    .sort((a, b) => b.days - a.days);

  return { mismatches, overdue, lateDeliveries, staleCheques, pendingCheques };
}

export interface ActivityItem {
  kind: "order" | "payment";
  id: string;
  date: string;
  vendorName: string;
  label: string;
  amount: number;
  sortKey: number;
}

/** Latest orders and payments combined, newest first. */
export function recentActivity(orders: Order[], payments: Payment[], limit = 8): ActivityItem[] {
  const items: ActivityItem[] = [
    ...orders.map((o) => ({
      kind: "order" as const, id: o.id, date: o.orderDate, vendorName: o.vendorName,
      label: `${poNumber(o.number)} · ${itemsSummary(o.items)}`, amount: o.amount, sortKey: millis(o.createdAt),
    })),
    ...payments.map((p) => ({
      kind: "payment" as const, id: p.id, date: p.date, vendorName: p.vendorName,
      label: methodLabel(p), amount: p.amount, sortKey: millis(p.createdAt),
    })),
  ];
  return items.sort((a, b) => b.sortKey - a.sortKey).slice(0, limit);
}

export function methodLabel(p: Pick<Payment, "method" | "bankRef" | "chequeNo" | "chequeBank" | "cashTo">): string {
  switch (p.method) {
    case "bank":
      return `Bank transfer${p.bankRef ? ` (ref ${p.bankRef})` : ""}`;
    case "cheque":
      return `Cheque #${p.chequeNo ?? "?"}${p.chequeBank ? ` ${p.chequeBank}` : ""}`;
    case "cash":
      return `Cash${p.cashTo ? ` to ${p.cashTo}` : ""}`;
  }
}

/** The purchase order as a WhatsApp message. */
export function orderMessage(order: Order, businessName: string): string {
  const lines = [
    `*Purchase order ${poNumber(order.number)}*`,
    `From: ${businessName || "—"}`,
    `Date: ${order.orderDate}`,
  ];
  if (order.expectedDate) lines.push(`Deliver by: ${order.expectedDate}`);
  lines.push("");
  order.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.name} — ${num(it.qty)} × ${money(it.rate)} = ${money(it.amount)}`);
  });
  lines.push("", `*Total: ${money(order.amount)}*`);
  if (order.note) lines.push(`Note: ${order.note}`);
  return lines.join("\n");
}

export function vendorStatement(
  vendor: Vendor,
  orders: Order[],
  payments: Payment[],
  businessName: string,
  asOf: string,
): string {
  const vOrders = orders.filter((o) => o.vendorId === vendor.id).sort(byOrderAge);
  const vPayments = payments.filter((p) => p.vendorId === vendor.id).sort(byPaymentAge);
  const ordered = round2(vOrders.reduce((s, o) => s + o.amount, 0));
  const paid = round2(vPayments.reduce((s, p) => s + p.amount, 0));
  const due = round2(ordered - paid);

  const lines = [
    `*Statement: ${vendor.name}*`,
    `From: ${businessName || "—"}`,
    `As of: ${asOf}`,
    "",
    "*Orders*",
  ];
  if (vOrders.length === 0) lines.push("None");
  for (const o of vOrders) {
    lines.push(`${o.orderDate} · ${poNumber(o.number)} · ${money(o.amount)} (${o.status})`);
    for (const it of o.items) lines.push(`   ${it.name}: ${num(it.qty)} × ${money(it.rate)}`);
    if (o.invoiceAmount != null) {
      const flag = amountsDiffer(o.invoiceAmount, o.amount) ? " ⚠ differs from order" : "";
      const no = o.invoiceNo ? ` #${o.invoiceNo}` : "";
      lines.push(`   Bill${no}: ${money(o.invoiceAmount)}${o.invoiceDate ? ` on ${o.invoiceDate}` : ""}${flag}`);
    }
  }
  lines.push(`Total ordered: ${money(ordered)}`, "", "*Payments*");
  if (vPayments.length === 0) lines.push("None");
  for (const p of vPayments) {
    const cleared = p.method === "cheque" ? ` (${p.clearedStatus === "cleared" ? "cleared" : "not yet cleared"})` : "";
    lines.push(`${p.date} · ${methodLabel(p)} · ${money(p.amount)}${cleared}`);
  }
  lines.push(`Total paid: ${money(paid)}`, "");
  lines.push(due < 0 ? `*Paid in advance: ${money(-due)}*` : `*Balance due: ${money(due)}*`);
  return lines.join("\n");
}
