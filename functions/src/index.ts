import { randomBytes } from "node:crypto";
import * as functionsV1 from "firebase-functions/v1";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

/**
 * Tenant provisioning. Runs once per new Firebase Auth user:
 * creates businesses/{uid} and stamps { businessId: uid } onto the user's
 * token. The client force-refreshes its ID token until the claim appears.
 * Name/phone are filled in by the client afterwards (rules allow the owner
 * to update only those two fields).
 */
export const provisionBusiness = functionsV1.auth.user().onCreate(async (user) => {
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
        description: o.description,
        qty: o.qty,
        rate: o.rate,
        amount: o.amount,
        orderDate: o.orderDate,
        status: o.status,
        invoiceAmount: o.invoiceAmount ?? null,
        invoiceDate: o.invoiceDate ?? null,
      };
    }),
    payments: payments.docs.map((d) => {
      const p = d.data();
      return {
        id: d.id,
        orderId: p.orderId,
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
