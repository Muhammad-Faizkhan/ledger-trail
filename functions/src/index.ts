import { createHash, randomBytes } from "node:crypto";
import * as functionsV1 from "firebase-functions/v1";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { catalogKey, InputError, itemsText, parseOrderInput, type OrderInput } from "./orderInput";

// Same region as the Firestore database. The web app, seed script and e2e tests
// call functions in this region too: getFunctions(app, "asia-south1").
const REGION = "asia-south1";
setGlobalOptions({ region: REGION });

initializeApp();
const db = getFirestore();

/**
 * Tenant provisioning. Runs once per new Firebase Auth user:
 * creates businesses/{uid} and stamps { businessId: uid } onto the user's
 * token. The client force-refreshes its ID token until the claim appears.
 * Name/phone are filled in by the client afterwards (rules allow the owner
 * to update only those two fields).
 */
export const provisionBusiness = functionsV1.region(REGION).auth.user().onCreate(async (user) => {
  const businessId = user.uid;
  const ref = db.doc(`businesses/${businessId}`);
  try {
    await ref.create({
      ownerUid: user.uid,
      name: "",
      phone: "",
      createdAt: FieldValue.serverTimestamp(),
      subscriptionStatus: "trial",
    });
  } catch (err: unknown) {
    // Retried delivery: the doc already exists, which is fine.
    if ((err as { code?: number }).code !== 6 /* ALREADY_EXISTS */) throw err;
  }
  await getAuth().setCustomUserClaims(user.uid, { businessId });
});

function requireBusinessId(auth: { token: Record<string, unknown> } | undefined): string {
  const businessId = auth?.token.businessId;
  if (typeof businessId !== "string" || !businessId) {
    throw new HttpsError("unauthenticated", "Sign in to a business account first.");
  }
  return businessId;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new HttpsError("invalid-argument", `Invalid ${name}.`);
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
export const saveOrder = onCall(async (req) => {
  const businessId = requireBusinessId(req.auth);
  const uid = req.auth!.uid;
  let input: OrderInput;
  try {
    input = parseOrderInput(req.data);
  } catch (err) {
    if (err instanceof InputError) throw new HttpsError("invalid-argument", err.message);
    throw err;
  }
  const biz = db.doc(`businesses/${businessId}`);
  const vendorRef = biz.collection("vendors").doc(input.vendorId);
  const counterRef = biz.collection("counters").doc("orders");

  return db.runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new HttpsError("not-found", "That vendor doesn't exist.");

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
      if (!existing.exists) throw new HttpsError("not-found", "This order was deleted.");
      if (existing.get("vendorId") !== input.vendorId) {
        throw new HttpsError("invalid-argument", "An order's vendor can't be changed. Delete it and make a new one.");
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
});

/**
 * Deletes an order. Payments that were pinned to it are kept and moved to the
 * vendor's account (they then pay the oldest unpaid orders). The PO number is
 * never handed out again.
 */
export const deleteOrder = onCall(async (req) => {
  const businessId = requireBusinessId(req.auth);
  const uid = req.auth!.uid;
  const orderId = requireString(req.data?.orderId, "orderId");
  const biz = db.doc(`businesses/${businessId}`);
  const orderRef = biz.collection("orders").doc(orderId);

  await db.runTransaction(async (tx) => {
    const order = await tx.get(orderRef);
    if (!order.exists) throw new HttpsError("not-found", "This order was already deleted.");
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
});

/**
 * Renames a vendor. The name is copied onto each of their orders and payments
 * (so lists and messages don't need a lookup), so they're all updated in the
 * same transaction. A saveOrder running at the same time reads the vendor in
 * its own transaction, so it retries and picks up the new name.
 */
export const renameVendor = onCall(async (req) => {
  const businessId = requireBusinessId(req.auth);
  const uid = req.auth!.uid;
  const vendorId = requireString(req.data?.vendorId, "vendorId");
  const raw = req.data?.name;
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new HttpsError("invalid-argument", "Enter the vendor's name.");
  if (name.length > 120) throw new HttpsError("invalid-argument", "The name is too long (at most 120 characters).");

  const biz = db.doc(`businesses/${businessId}`);
  const vendorRef = biz.collection("vendors").doc(vendorId);
  await db.runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new HttpsError("not-found", "Vendor not found.");
    const old = vendor.get("name");
    if (old === name) return;
    const [orders, payments] = await Promise.all([
      tx.get(biz.collection("orders").where("vendorId", "==", vendorId)),
      tx.get(biz.collection("payments").where("vendorId", "==", vendorId)),
    ]);
    tx.update(vendorRef, { name });
    for (const d of [...orders.docs, ...payments.docs]) tx.update(d.ref, { vendorName: name });
    logEntry(tx, biz, uid, vendorId, "name", old, name, "vendor");
  });
  return { ok: true };
});

/**
 * Creates (or returns the existing) self-serve link token for a vendor.
 * Tokens live in the top-level vendorLinks collection, which has no client
 * read/write path in the security rules; the vendor doc only mirrors the
 * token so the owner's UI can display the link.
 */
export const createVendorLink = onCall(async (req) => {
  const businessId = requireBusinessId(req.auth);
  const vendorId = requireString(req.data?.vendorId, "vendorId");
  const vendorRef = db.doc(`businesses/${businessId}/vendors/${vendorId}`);

  return db.runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new HttpsError("not-found", "Vendor not found.");
    const existing = vendor.get("linkToken");
    if (typeof existing === "string" && existing) return { token: existing };

    const token = randomBytes(24).toString("base64url"); // 32 chars, 192 bits
    tx.create(db.doc(`vendorLinks/${token}`), {
      businessId,
      vendorId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(vendorRef, { linkToken: token });
    return { token };
  });
});

export const revokeVendorLink = onCall(async (req) => {
  const businessId = requireBusinessId(req.auth);
  const vendorId = requireString(req.data?.vendorId, "vendorId");
  const vendorRef = db.doc(`businesses/${businessId}/vendors/${vendorId}`);

  await db.runTransaction(async (tx) => {
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) throw new HttpsError("not-found", "Vendor not found.");
    const token = vendor.get("linkToken");
    if (typeof token === "string" && token) tx.delete(db.doc(`vendorLinks/${token}`));
    tx.update(vendorRef, { linkToken: null });
  });
  return { ok: true };
});

/**
 * Unauthenticated, read-only resolution of a vendor self-serve link.
 * The businessId/vendorId come only from the server-side token doc, never
 * from the caller. Returns just that vendor's orders and payments, minus
 * the owner's internal fields (vendor notes, owner bank account).
 */
export const resolveVendorLink = onCall(async (req) => {
  const token = req.data?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(token)) {
    throw new HttpsError("not-found", "This link is invalid or has been revoked.");
  }
  const link = await db.doc(`vendorLinks/${token}`).get();
  if (!link.exists) {
    throw new HttpsError("not-found", "This link is invalid or has been revoked.");
  }
  const { businessId, vendorId } = link.data() as { businessId: string; vendorId: string };
  const biz = db.doc(`businesses/${businessId}`);

  const [business, vendor, orders, payments] = await Promise.all([
    biz.get(),
    biz.collection("vendors").doc(vendorId).get(),
    biz.collection("orders").where("vendorId", "==", vendorId).get(),
    biz.collection("payments").where("vendorId", "==", vendorId).get(),
  ]);
  if (!vendor.exists) {
    throw new HttpsError("not-found", "This link is invalid or has been revoked.");
  }

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
});
