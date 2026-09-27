// Two-tenant isolation + validation checks against the Firestore emulator.
// Run with: npm run test:rules
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const A = "bizA";
const B = "bizB";

// Each tenant's token carries the businessId claim the provisioning function sets.
const dbA = () => env.authenticatedContext("uidA", { businessId: A }).firestore() as unknown as Firestore;
const dbB = () => env.authenticatedContext("uidB", { businessId: B }).firestore() as unknown as Firestore;
const dbNoClaim = () => env.authenticatedContext("uidC").firestore() as unknown as Firestore;
const dbAnon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const order = (over: Record<string, unknown> = {}) => ({
  number: 1, vendorId: "v1", vendorName: "Vendor One",
  items: [{ name: "Cotton", qty: 200, unit: "yd", rate: 12.5, amount: 2500 }],
  amount: 2500, orderDate: "2026-09-01", expectedDate: null, status: "ordered",
  invoiceAmount: null, invoiceNo: null, invoiceDate: null, note: "", createdAt: serverTimestamp(), ...over,
});

const payment = (over: Record<string, unknown> = {}) => ({
  orderId: "o1", vendorId: "v1", vendorName: "Vendor One", amount: 1000, method: "bank",
  date: "2026-09-02", bankAccount: "HBL-01", bankRef: "TX1", chequeNo: null, chequeBank: null,
  chequeDate: null, clearedStatus: null, clearedDate: null, cashTo: null,
  createdAt: serverTimestamp(), ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-ledgertrail-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    for (const biz of [A, B]) {
      await setDoc(doc(db, `businesses/${biz}`), {
        ownerUid: biz === A ? "uidA" : "uidB", name: biz, phone: "", subscriptionStatus: "trial",
      });
      await setDoc(doc(db, `businesses/${biz}/vendors/v1`), { name: "Vendor One", phone: "", notes: "" });
      await setDoc(doc(db, `businesses/${biz}/orders/o1`), { ...order(), createdAt: new Date() });
      await setDoc(doc(db, `businesses/${biz}/payments/p1`), { ...payment(), createdAt: new Date() });
    }
    await setDoc(doc(db, "vendorLinks/sometoken"), { businessId: A, vendorId: "v1" });
  });
});

describe("tenant isolation", () => {
  it("owner can read their own business data", async () => {
    await assertSucceeds(getDoc(doc(dbA(), `businesses/${A}`)));
    await assertSucceeds(getDocs(collection(dbA(), `businesses/${A}/vendors`)));
    await assertSucceeds(getDocs(collection(dbA(), `businesses/${A}/orders`)));
    await assertSucceeds(getDocs(collection(dbA(), `businesses/${A}/payments`)));
  });

  it("account B cannot read account A's business, vendors, orders or payments", async () => {
    await assertFails(getDoc(doc(dbB(), `businesses/${A}`)));
    await assertFails(getDocs(collection(dbB(), `businesses/${A}/vendors`)));
    await assertFails(getDoc(doc(dbB(), `businesses/${A}/vendors/v1`)));
    await assertFails(getDocs(collection(dbB(), `businesses/${A}/orders`)));
    await assertFails(getDocs(collection(dbB(), `businesses/${A}/payments`)));
    await assertFails(getDocs(collection(dbB(), `businesses/${A}/auditLog`)));
  });

  it("account B cannot write into account A", async () => {
    await assertFails(setDoc(doc(dbB(), `businesses/${A}/vendors/x`), {
      name: "Evil", phone: "", notes: "", createdAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(dbB(), `businesses/${A}/orders/o1`), { note: "hacked" }));
    await assertFails(deleteDoc(doc(dbB(), `businesses/${A}/orders/o1`)));
    await assertFails(deleteDoc(doc(dbB(), `businesses/${A}/payments/p1`)));
    await assertFails(updateDoc(doc(dbB(), `businesses/${A}`), { name: "hacked" }));
  });

  it("users without a businessId claim and anonymous users get nothing", async () => {
    await assertFails(getDoc(doc(dbNoClaim(), `businesses/${A}`)));
    await assertFails(getDocs(collection(dbNoClaim(), `businesses/${A}/orders`)));
    await assertFails(getDoc(doc(dbAnon(), `businesses/${A}`)));
  });

  it("vendorLinks have no client read or write path, even for the owner", async () => {
    await assertFails(getDoc(doc(dbA(), "vendorLinks/sometoken")));
    await assertFails(getDoc(doc(dbAnon(), "vendorLinks/sometoken")));
    await assertFails(setDoc(doc(dbA(), "vendorLinks/mine"), { businessId: A, vendorId: "v1" }));
  });

  it("clients cannot create businesses or change server-owned fields", async () => {
    await assertFails(setDoc(doc(dbA(), "businesses/newbiz"), { ownerUid: "uidA" }));
    await assertFails(updateDoc(doc(dbA(), `businesses/${A}`), { subscriptionStatus: "active" }));
    await assertFails(updateDoc(doc(dbA(), `businesses/${A}`), { ownerUid: "uidB" }));
    await assertSucceeds(updateDoc(doc(dbA(), `businesses/${A}`), { name: "Acme", phone: "0300" }));
  });
});

describe("data validation", () => {
  it("clients can read orders and the item list but never write them", async () => {
    const orders = collection(dbA(), `businesses/${A}/orders`);
    await assertSucceeds(getDoc(doc(orders, "o1")));
    await assertFails(addDoc(orders, order()));
    await assertFails(setDoc(doc(orders, "o2"), order()));
    await assertFails(updateDoc(doc(orders, "o1"), { status: "received" }));
    await assertFails(deleteDoc(doc(orders, "o1")));

    await assertSucceeds(getDocs(collection(dbA(), `businesses/${A}/items`)));
    await assertFails(getDocs(collection(dbB(), `businesses/${A}/items`)));
    await assertFails(setDoc(doc(dbA(), `businesses/${A}/items/cement`), { name: "Cement", unit: "bag", lastRate: 1 }));
  });

  it("the PO counter has no client access at all", async () => {
    await assertFails(getDoc(doc(dbA(), `businesses/${A}/counters/orders`)));
    await assertFails(setDoc(doc(dbA(), `businesses/${A}/counters/orders`), { next: 1 }));
  });

  it("payments go against a vendor's account or one of that vendor's orders", async () => {
    const payments = collection(dbA(), `businesses/${A}/payments`);
    await assertSucceeds(addDoc(payments, payment()));
    await assertSucceeds(addDoc(payments, payment({ orderId: null })));
    await assertFails(addDoc(payments, payment({ orderId: "missing" })));
    await assertFails(addDoc(payments, payment({ vendorId: "other" })));
    await assertFails(addDoc(payments, payment({ orderId: null, vendorId: "nope" })));
    await assertFails(addDoc(payments, payment({ amount: 0 })));
  });

  it("cheques start issued and can only be cleared in place", async () => {
    const payments = collection(dbA(), `businesses/${A}/payments`);
    const cheque = payment({
      method: "cheque", bankAccount: null, bankRef: null, chequeNo: "000123",
      chequeBank: "MCB", chequeDate: "2026-09-02", clearedStatus: "issued",
    });
    await assertFails(addDoc(payments, { ...cheque, clearedStatus: "cleared" }));
    const ref = await assertSucceeds(addDoc(payments, cheque));
    await assertSucceeds(updateDoc(ref, { clearedStatus: "cleared", clearedDate: "2026-09-10" }));
    await assertFails(updateDoc(ref, { amount: 5 }));
    await assertFails(updateDoc(doc(dbA(), `businesses/${A}/payments/p1`), { clearedStatus: "cleared" }));
  });

  it("audit log is append-only and stamped with the caller", async () => {
    const log = collection(dbA(), `businesses/${A}/auditLog`);
    const entry = {
      entity: "order", entityId: "o1", field: "qty", oldValue: 200, newValue: 10,
      editedBy: "uidA", editedAt: serverTimestamp(),
    };
    const ref = await assertSucceeds(addDoc(log, entry));
    await assertFails(addDoc(log, { ...entry, editedBy: "someoneElse" }));
    await assertFails(updateDoc(ref, { newValue: 1 }));
    await assertFails(deleteDoc(ref));
  });

  it("vendor name is fixed after creation; phone and notes are editable", async () => {
    const ref = doc(dbA(), `businesses/${A}/vendors/v1`);
    await assertFails(updateDoc(ref, { name: "Renamed" }));
    await assertFails(updateDoc(ref, { linkToken: "forged" }));
    await assertSucceeds(updateDoc(ref, { phone: "03001234567", notes: "net 30" }));
  });
});
