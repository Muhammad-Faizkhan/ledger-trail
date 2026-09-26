// Pure derived views over stored data. Every figure the UI shows comes from
// here (or straight from stored fields) — nothing is re-typed.
import { amountsDiffer, daysBetween, money, num, round2 } from "./format";
import type { Order, Payment, Vendor } from "./types";

export const OVERDUE_DAYS = 30;
export const STALE_CHEQUE_DAYS = 7;

export function paidByOrder(payments: Payment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) m.set(p.orderId, (m.get(p.orderId) ?? 0) + p.amount);
  return m;
}

export function paymentsByOrder(payments: Payment[]): Map<string, Payment[]> {
  const m = new Map<string, Payment[]>();
  for (const p of payments) {
    const list = m.get(p.orderId);
    if (list) list.push(p);
    else m.set(p.orderId, [p]);
  }
  return m;
}

export function orderBalance(order: Order, paid: Map<string, number>): number {
  return round2(order.amount - (paid.get(order.id) ?? 0));
}

export interface VendorTotals {
  ordered: number;
  paid: number;
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

export interface StaleCheque {
  payment: Payment;
  days: number;
}

export interface AuditReport {
  mismatches: Order[];
  overdue: OverdueOrder[];
  staleCheques: StaleCheque[];
  pendingCheques: Payment[];
  orphanPayments: Payment[];
}

export function audit(orders: Order[], payments: Payment[], asOf: string): AuditReport {
  const paid = paidByOrder(payments);
  const orderIds = new Set(orders.map((o) => o.id));

  const mismatches = orders.filter(
    (o) => o.invoiceAmount != null && amountsDiffer(o.invoiceAmount, o.amount),
  );

  const overdue = orders
    .map((order) => ({
      order,
      balance: orderBalance(order, paid),
      days: daysBetween(order.orderDate, asOf),
    }))
    .filter((x) => x.balance > 0 && x.days > OVERDUE_DAYS)
    .sort((a, b) => b.days - a.days);

  const pendingCheques = payments.filter(
    (p) => p.method === "cheque" && p.clearedStatus !== "cleared",
  );

  const staleCheques = pendingCheques
    .map((payment) => ({ payment, days: daysBetween(payment.chequeDate ?? payment.date, asOf) }))
    .filter((x) => x.days > STALE_CHEQUE_DAYS)
    .sort((a, b) => b.days - a.days);

  const orphanPayments = payments.filter((p) => !orderIds.has(p.orderId));

  return { mismatches, overdue, staleCheques, pendingCheques, orphanPayments };
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
  // A write still waiting for its server timestamp is the newest thing there is.
  const key = (t: { toMillis(): number } | null) => (t ? t.toMillis() : Number.MAX_SAFE_INTEGER);
  const items: ActivityItem[] = [
    ...orders.map((o) => ({
      kind: "order" as const, id: o.id, date: o.orderDate, vendorName: o.vendorName,
      label: o.description, amount: o.amount, sortKey: key(o.createdAt),
    })),
    ...payments.map((p) => ({
      kind: "payment" as const, id: p.id, date: p.date, vendorName: p.vendorName,
      label: methodLabel(p), amount: p.amount, sortKey: key(p.createdAt),
    })),
  ];
  return items.sort((a, b) => b.sortKey - a.sortKey).slice(0, limit);
}

export function methodLabel(p: Payment): string {
  switch (p.method) {
    case "bank":
      return `Bank transfer${p.bankRef ? ` (ref ${p.bankRef})` : ""}`;
    case "cheque":
      return `Cheque #${p.chequeNo ?? "?"}${p.chequeBank ? ` ${p.chequeBank}` : ""}`;
    case "cash":
      return `Cash${p.cashTo ? ` to ${p.cashTo}` : ""}`;
  }
}

export function orderMessage(order: Order, businessName: string): string {
  return [
    `*Order from ${businessName || "us"}*`,
    `Item: ${order.description}`,
    `Qty: ${num(order.qty)} × ${money(order.rate)} = ${money(order.amount)}`,
    `Order date: ${order.orderDate}`,
    `Status: ${order.status}`,
  ].join("\n");
}

export function vendorStatement(
  vendor: Vendor,
  orders: Order[],
  payments: Payment[],
  businessName: string,
  asOf: string,
): string {
  const vOrders = orders
    .filter((o) => o.vendorId === vendor.id)
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  const vPayments = payments
    .filter((p) => p.vendorId === vendor.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const ordered = round2(vOrders.reduce((s, o) => s + o.amount, 0));
  const paid = round2(vPayments.reduce((s, p) => s + p.amount, 0));

  const lines = [
    `*Statement: ${vendor.name}*`,
    `From: ${businessName || "—"}`,
    `As of: ${asOf}`,
    "",
    "*Orders*",
  ];
  if (vOrders.length === 0) lines.push("None");
  for (const o of vOrders) {
    lines.push(`${o.orderDate} · ${o.description}`);
    lines.push(`   ${num(o.qty)} × ${money(o.rate)} = ${money(o.amount)} (${o.status})`);
    if (o.invoiceAmount != null) {
      const flag = amountsDiffer(o.invoiceAmount, o.amount) ? " ⚠ differs from order" : "";
      lines.push(`   Invoice: ${money(o.invoiceAmount)}${o.invoiceDate ? ` on ${o.invoiceDate}` : ""}${flag}`);
    }
  }
  lines.push(`Total ordered: ${money(ordered)}`, "", "*Payments*");
  if (vPayments.length === 0) lines.push("None");
  for (const p of vPayments) {
    const cleared = p.method === "cheque" ? ` (${p.clearedStatus === "cleared" ? "cleared" : "not yet cleared"})` : "";
    lines.push(`${p.date} · ${methodLabel(p)} · ${money(p.amount)}${cleared}`);
  }
  lines.push(`Total paid: ${money(paid)}`, "", `*Outstanding balance: ${money(ordered - paid)}*`);
  return lines.join("\n");
}
