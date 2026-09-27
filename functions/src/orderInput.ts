// Validation for saveOrder input. No Firebase imports, so unit tests can load it directly.
// Messages are shown to the owner as-is.

export const MAX_ITEMS = 50;
const MAX_NUMBER = 1_000_000_000;
const STATUSES = ["ordered", "confirmed", "received"] as const;

export class InputError extends Error {}

export interface OrderItemInput {
  name: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface OrderInput {
  orderId: string | null;
  vendorId: string;
  items: OrderItemInput[];
  amount: number;
  orderDate: string;
  expectedDate: string | null;
  status: (typeof STATUSES)[number];
  invoiceAmount: number | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  note: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function text(v: unknown, max: number, what: string, required = false): string {
  if (v == null) v = "";
  if (typeof v !== "string") throw new InputError(`${what} must be text.`);
  const s = v.trim().replace(/\s+/g, " ");
  if (required && !s) throw new InputError(`Enter ${what.toLowerCase()}.`);
  if (s.length > max) throw new InputError(`${what} is too long (at most ${max} characters).`);
  return s;
}

function optText(v: unknown, max: number, what: string): string | null {
  return text(v, max, what) || null;
}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Quantities keep 3 decimals (2.125 ton); money keeps 2. */
function number(v: unknown, what: string, { allowZero, decimals }: { allowZero: boolean; decimals: 2 | 3 }): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new InputError(`${what} must be a number.`);
  if (allowZero ? v < 0 : v <= 0) throw new InputError(allowZero ? `${what} can't be negative.` : `${what} must be more than 0.`);
  if (v > MAX_NUMBER) throw new InputError(`${what} is too large.`);
  return decimals === 3 ? round3(v) : round2(v);
}

function date(v: unknown, what: string): string {
  if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new InputError(`${what} isn't a valid date.`);
  }
  return v;
}

const optDate = (v: unknown, what: string) => (v == null || v === "" ? null : date(v, what));

export function parseOrderInput(data: unknown): OrderInput {
  if (typeof data !== "object" || data == null) throw new InputError("Missing order details.");
  const d = data as Record<string, unknown>;

  const orderId = d.orderId == null ? null : d.orderId;
  if (orderId !== null && (typeof orderId !== "string" || !ID.test(orderId))) throw new InputError("Invalid order.");
  if (typeof d.vendorId !== "string" || !ID.test(d.vendorId)) throw new InputError("Pick a vendor.");

  if (!Array.isArray(d.items) || d.items.length === 0) throw new InputError("Add at least one item.");
  if (d.items.length > MAX_ITEMS) throw new InputError(`An order can have at most ${MAX_ITEMS} items.`);
  const items = d.items.map((raw: unknown, i: number): OrderItemInput => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const row = `Item ${i + 1}`;
    const qty = number(it.qty, `${row} quantity`, { allowZero: false, decimals: 3 });
    if (qty === 0) throw new InputError(`${row} quantity must be more than 0.`);
    const rate = number(it.rate, `${row} rate`, { allowZero: true, decimals: 2 });
    return {
      name: text(it.name, 120, `${row} name`, true),
      qty,
      unit: text(it.unit, 20, `${row} unit`),
      rate,
      amount: round2(qty * rate),
    };
  });
  // Sum in paisa so the total is exact.
  const amount = items.reduce((s, it) => s + Math.round(it.amount * 100), 0) / 100;

  if (!STATUSES.includes(d.status as OrderInput["status"])) throw new InputError("Invalid status.");

  const invoiceAmount = d.invoiceAmount == null ? null
    : number(d.invoiceAmount, "Bill amount", { allowZero: true, decimals: 2 });

  return {
    orderId,
    vendorId: d.vendorId,
    items,
    amount,
    orderDate: date(d.orderDate, "Order date"),
    expectedDate: optDate(d.expectedDate, "Delivery date"),
    status: d.status as OrderInput["status"],
    invoiceAmount,
    invoiceNo: optText(d.invoiceNo, 60, "Bill number"),
    invoiceDate: optDate(d.invoiceDate, "Bill date"),
    note: text(d.note, 1000, "Note"),
  };
}

/** Catalog doc id for an item name: case- and spacing-insensitive. */
export function catalogKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** One line per item, for edit history. */
export function itemsText(items: OrderItemInput[]): string {
  return items.map((it) => `${it.name} ${it.qty}${it.unit ? ` ${it.unit}` : ""} × ${it.rate}`).join("; ");
}
