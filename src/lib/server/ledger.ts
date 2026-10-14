// The server-side writes, run by src/app/api/fn/[name]/route.ts on Vercel.
// Ported from functions/src/index.ts so the app works on Firebase's free
// Spark plan (Cloud Functions need Blaze). Keep the two in step until one goes.
import { createHash, randomBytes } from "node:crypto";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { catalogKey, InputError, itemsText, parseOrderInput, type OrderInput } from "../../../functions/src/orderInput";
import { adminAuth, adminDb as db } from "./admin";

export type ApiErrorCode = "unauthenticated" | "invalid-argument" | "not-found" | "internal";

/** An error whose message is shown to the user as-is. */
export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) {
    super(message);
  }
}

/** The verified caller, or null when the request carried no ID token. */
export type Caller = { uid: string; businessId: string | null } | null;

function requireBusinessId(caller: Caller): { uid: string; businessId: string } {
  if (!caller?.businessId) throw new ApiError("unauthenticated", "Sign in to a business account first.");
  return { uid: caller.uid, businessId: caller.businessId };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new ApiError("invalid-argument", `Invalid ${name}.`);
  }
  return value;
}

const poNumber = (n: number) => `PO-${String(n).padStart(4, "0")}`;
const rs = (n: number) => `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

function logEntry(
  tx: Transaction, biz: DocumentReference, uid: string,
  entityId: string, field: string, oldValue: unknown, newValue: unknown,
  entity: "order" | "payment" | "vendor" = "order",
) {
  tx.create(biz.collection("auditLog").doc(), {
    entity, entityId, field, oldValue: oldValue ?? null, newValue: newValue ?? null,
    editedBy: uid, editedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Tenant provisioning, called by the client right after signup (replaces the
 * provisionBusiness auth trigger). Creates businesses/{uid} and stamps
 * { businessId: uid } onto the user's token. Safe to call again.
 */
async function provisionBusiness(caller: Caller) {
  if (!caller) throw new ApiError("unauthenticated", "Sign in first.");
  if (caller.businessId) return { businessId: caller.businessId };
  const businessId = caller.uid;
  try {
    await db().doc(`businesses/${businessId}`).create({
      ownerUid: caller.uid,
      name: "",
      phone: "",
      createdAt: FieldValue.serverTimestamp(),
      subscriptionStatus: "trial",
    });
  } catch (err: unknown) {
    // A repeated call: the doc already exists, which is fine.
    if ((err as { code?: number }).code !== 6 /* ALREADY_EXISTS */) throw err;
  }
  await adminAuth().setCustomUserClaims(caller.uid, { businessId });
  return { businessId };
}

// Fields an owner can change on an existing order, and how edit history shows them.
const EDITABLE: (keyof OrderInput)[] = [
  "items", "amount", "orderDate", "expectedDate", "status", "invoiceAmount", "invoiceNo", "invoiceDate", "note",
];

/**
 * Creates or edits an order. Orders are read-only to clients, so this is the
 * only way one gets written: it checks every item, computes the amounts,
 * hands out the next PO number, logs edits, and keeps the saved item list
 * (catalog) up to date — all in one transaction.
 */
async function saveOrder(caller: Caller, data: unknown) {
  const { uid, businessId } = requireBusinessId(caller);
  let input: OrderInput;
  try {
    input = parseOrderInput(data);
  } catch (err) {
    if (err instanceof InputError) throw new ApiError("invalid-argument", err.message);
    throw err;
  }
  const biz = db().doc(`businesses/${businessId}`);
  const vendorRef = biz.collection("vendors").doc(input.vendorId);
  const counterRef = biz.collection("counters").doc("orders");

  return db().runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new ApiError("not-found", "That vendor doesn't exist.");

    const fields = {
      items: input.items,
      amount: input.amount,
      orderDate: input.orderDate,
      expectedDate: input.expectedDate,
      status: input.status,
      invoiceAmount: input.invoiceAmount,
      invoiceNo: input.invoiceNo,
      invoiceDate: input.invoiceDate,
      note: input.note,
    };

    let orderRef: DocumentReference;
    let number: number;
    if (input.orderId) {
      orderRef = biz.collection("orders").doc(input.orderId);
      const existing = await tx.get(orderRef);
      if (!existing.exists) throw new ApiError("not-found", "This order was deleted.");
      if (existing.get("vendorId") !== input.vendorId) {
        throw new ApiError("invalid-argument", "An order's vendor can't be changed. Delete it and make a new one.");
      }
      number = existing.get("number");
      tx.update(orderRef, fields);
      for (const field of EDITABLE) {
        const before = existing.get(field) ?? null;
        const after = input[field] ?? null;
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        if (field === "items") logEntry(tx, biz, uid, orderRef.id, "items", itemsText(before), itemsText(input.items));
        else logEntry(tx, biz, uid, orderRef.id, field, before, after);
      }
    } else {
      const counter = await tx.get(counterRef);
      number = (counter.get("next") as number | undefined) ?? 1;
      orderRef = biz.collection("orders").doc();
      tx.set(counterRef, { next: number + 1 });
      tx.create(orderRef, {
        ...fields,
        number,
        vendorId: input.vendorId,
        vendorName: vendor.get("name"),
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    for (const it of input.items) {
      const id = createHash("sha1").update(catalogKey(it.name)).digest("hex").slice(0, 20);
      tx.set(biz.collection("items").doc(id), {
        name: it.name, lastRate: it.rate, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { id: orderRef.id, number };
  });
}

/**
 * Deletes an order. Payments that were pinned to it are kept and moved to the
 * vendor's account (they then pay the oldest unpaid orders). The PO number is
 * never handed out again.
 */
async function deleteOrder(caller: Caller, data: unknown) {
  const { uid, businessId } = requireBusinessId(caller);
  const orderId = requireString((data as { orderId?: unknown })?.orderId, "orderId");
  const biz = db().doc(`businesses/${businessId}`);
  const orderRef = biz.collection("orders").doc(orderId);

  await db().runTransaction(async (tx) => {
    const order = await tx.get(orderRef);
    if (!order.exists) throw new ApiError("not-found", "This order was already deleted.");
    const pinned = await tx.get(biz.collection("payments").where("orderId", "==", orderId));
    for (const p of pinned.docs) {
      tx.update(p.ref, { orderId: null });
      logEntry(tx, biz, uid, p.id, "orderId", poNumber(order.get("number")), null, "payment");
    }
    tx.delete(orderRef);
    logEntry(tx, biz, uid, orderId, "deleted",
      `${order.get("vendorName")}: ${poNumber(order.get("number"))}, ${rs(order.get("amount"))} (${order.get("orderDate")})`,
      null);
  });
  return { ok: true };
}

/**
 * Renames a vendor. The name is copied onto each of their orders and payments
 * (so lists and messages don't need a lookup), so they're all updated in the
 * same transaction. A saveOrder running at the same time reads the vendor in
 * its own transaction, so it retries and picks up the new name.
 */
async function renameVendor(caller: Caller, data: unknown) {
  const { uid, businessId } = requireBusinessId(caller);
  const d = data as { vendorId?: unknown; name?: unknown } | null;
  const vendorId = requireString(d?.vendorId, "vendorId");
  const name = typeof d?.name === "string" ? d.name.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new ApiError("invalid-argument", "Enter the vendor's name.");
  if (name.length > 120) throw new ApiError("invalid-argument", "The name is too long (at most 120 characters).");

  const biz = db().doc(`businesses/${businessId}`);
  const vendorRef = biz.collection("vendors").doc(vendorId);
  await db().runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new ApiError("not-found", "Vendor not found.");
    const old = vendor.get("name");
    if (old === name) return;
    const [orders, payments] = await Promise.all([
      tx.get(biz.collection("orders").where("vendorId", "==", vendorId)),
      tx.get(biz.collection("payments").where("vendorId", "==", vendorId)),
    ]);
    tx.update(vendorRef, { name });
    for (const doc of [...orders.docs, ...payments.docs]) tx.update(doc.ref, { vendorName: name });
    logEntry(tx, biz, uid, vendorId, "name", old, name, "vendor");
  });
  return { ok: true };
}

/**
 * Creates (or returns the existing) self-serve link token for a vendor.
 * Tokens live in the top-level vendorLinks collection, which has no client
 * read/write path in the security rules; the vendor doc only mirrors the
 * token so the owner's UI can display the link.
 */
async function createVendorLink(caller: Caller, data: unknown) {
  const { businessId } = requireBusinessId(caller);
  const vendorId = requireString((data as { vendorId?: unknown })?.vendorId, "vendorId");
  const vendorRef = db().doc(`businesses/${businessId}/vendors/${vendorId}`);

  return db().runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new ApiError("not-found", "Vendor not found.");
    const existing = vendor.get("linkToken");
    if (typeof existing === "string" && existing) return { token: existing };

    const token = randomBytes(24).toString("base64url"); // 32 chars, 192 bits
    tx.create(db().doc(`vendorLinks/${token}`), {
      businessId,
      vendorId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(vendorRef, { linkToken: token });
    return { token };
  });
}

async function revokeVendorLink(caller: Caller, data: unknown) {
  const { businessId } = requireBusinessId(caller);
  const vendorId = requireString((data as { vendorId?: unknown })?.vendorId, "vendorId");
  const vendorRef = db().doc(`businesses/${businessId}/vendors/${vendorId}`);

  await db().runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new ApiError("not-found", "Vendor not found.");
    const token = vendor.get("linkToken");
    if (typeof token === "string" && token) tx.delete(db().doc(`vendorLinks/${token}`));
    tx.update(vendorRef, { linkToken: null });
  });
  return { ok: true };
}

/**
 * Unauthenticated, read-only resolution of a vendor self-serve link.
 * The businessId/vendorId come only from the server-side token doc, never
 * from the caller. Returns just that vendor's orders and payments, minus
 * the owner's internal fields (vendor notes, owner bank account).
 */
async function resolveVendorLink(_caller: Caller, data: unknown) {
  const token = (data as { token?: unknown })?.token;
  const gone = () => new ApiError("not-found", "This link is invalid or has been revoked.");
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(token)) throw gone();
  const link = await db().doc(`vendorLinks/${token}`).get();
  if (!link.exists) throw gone();
  const { businessId, vendorId } = link.data() as { businessId: string; vendorId: string };
  const biz = db().doc(`businesses/${businessId}`);

  const [business, vendor, orders, payments] = await Promise.all([
    biz.get(),
    biz.collection("vendors").doc(vendorId).get(),
    biz.collection("orders").where("vendorId", "==", vendorId).get(),
    biz.collection("payments").where("vendorId", "==", vendorId).get(),
  ]);
  if (!vendor.exists) throw gone();

  return {
    businessName: business.get("name") || "Your customer",
    vendorName: vendor.get("name"),
    orders: orders.docs.map((d) => {
      const o = d.data();
      return {
        id: d.id,
        number: o.number,
        items: o.items,
        amount: o.amount,
        orderDate: o.orderDate,
        expectedDate: o.expectedDate ?? null,
        status: o.status,
        invoiceAmount: o.invoiceAmount ?? null,
        invoiceNo: o.invoiceNo ?? null,
        invoiceDate: o.invoiceDate ?? null,
        note: o.note ?? "",
      };
    }),
    payments: payments.docs.map((d) => {
      const p = d.data();
      return {
        id: d.id,
        orderId: p.orderId ?? null,
        amount: p.amount,
        method: p.method,
        date: p.date,
        bankRef: p.bankRef ?? null,
        chequeNo: p.chequeNo ?? null,
        chequeBank: p.chequeBank ?? null,
        chequeDate: p.chequeDate ?? null,
        clearedStatus: p.clearedStatus ?? null,
      };
    }),
  };
}

export const handlers: Record<string, (caller: Caller, data: unknown) => Promise<unknown>> = {
  provisionBusiness, saveOrder, deleteOrder, renameVendor, createVendorLink, revokeVendorLink, resolveVendorLink,
};
