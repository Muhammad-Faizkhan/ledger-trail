// End-to-end against the Auth + Firestore + Functions emulators, using real
// signups: provisioning trigger -> businessId claim -> tenant isolation with
// real tokens -> vendor self-serve link resolution.
// Run with: npm run test:e2e
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type User,
} from "firebase/auth";
import {
  addDoc, collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore,
  serverTimestamp, terminate, updateDoc, type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { afterAll, describe, expect, it } from "vitest";

const PROJECT = "demo-ledgertrail";
const apps: FirebaseApp[] = [];

function client(name: string) {
  const app = initializeApp({ apiKey: "demo-key", projectId: PROJECT, appId: "demo" }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  return { auth, db, fns };
}

async function waitForClaim(user: User): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await user.getIdTokenResult(true);
    if (typeof res.claims.businessId === "string") return res.claims.businessId;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("businessId claim never appeared");
}

async function signUp(name: string) {
  const c = client(name);
  const email = `${name}-${Date.now()}@example.com`;
  const cred = await createUserWithEmailAndPassword(c.auth, email, "password123");
  const businessId = await waitForClaim(cred.user);
  return { ...c, user: cred.user, businessId };
}

const newOrder = (vendorId: string, over: Record<string, unknown> = {}) => ({
  vendorId, items: [{ name: "Cotton", qty: 200, rate: 12.5 }],
  orderDate: "2026-09-01", expectedDate: null, status: "ordered",
  invoiceAmount: null, invoiceNo: null, invoiceDate: null, note: "", ...over,
});

async function denied(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ code: "permission-denied" });
}

afterAll(async () => {
  for (const app of apps) {
    await terminate(getFirestore(app)).catch(() => {});
    await deleteApp(app);
  }
});

describe("signup, provisioning and isolation", () => {
  let a: Awaited<ReturnType<typeof signUp>>;
  let b: Awaited<ReturnType<typeof signUp>>;
  let vendorId: string;

  it("provisions a business per signup with the uid as businessId", async () => {
    a = await signUp("owner-a");
    b = await signUp("owner-b");
    expect(a.businessId).toBe(a.user.uid);
    expect(b.businessId).toBe(b.user.uid);

    const biz = await getDoc(doc(a.db, `businesses/${a.businessId}`));
    expect(biz.data()).toMatchObject({ ownerUid: a.user.uid, subscriptionStatus: "trial" });
    await updateDoc(doc(a.db, `businesses/${a.businessId}`), { name: "A Traders", phone: "0300" });
  });

  it("owner A can write and read their own vendors and orders", async () => {
    const v = await addDoc(collection(a.db, `businesses/${a.businessId}/vendors`), {
      name: "Karachi Cotton", phone: "0300 1234567", notes: "internal note", createdAt: serverTimestamp(),
    });
    vendorId = v.id;
    await httpsCallable(a.fns, "saveOrder")(newOrder(vendorId));
    const orders = await getDocs(collection(a.db, `businesses/${a.businessId}/orders`));
    expect(orders.size).toBe(1);
  });

  it("saveOrder numbers orders, computes amounts, and fills the item list", async () => {
    const save = httpsCallable<Record<string, unknown>, { id: string; number: number }>(a.fns, "saveOrder");
    const second = await save(newOrder(vendorId, {
      items: [
        // An old client may still send a unit; it's ignored.
        { name: "  Cement ", qty: 50, unit: "bag", rate: 1450 },
        { name: "Binding wire", qty: 3, rate: 0.1 },
      ],
    }));
    expect(second.data.number).toBe(2);

    const o = (await getDoc(doc(a.db, `businesses/${a.businessId}/orders/${second.data.id}`))).data()!;
    expect(o).toMatchObject({
      number: 2, vendorId, vendorName: "Karachi Cotton", amount: 72_500.3,
      items: [
        { name: "Cement", qty: 50, rate: 1450, amount: 72_500 },
        { name: "Binding wire", qty: 3, rate: 0.1, amount: 0.3 },
      ],
    });

    expect(o.items[0]).not.toHaveProperty("unit");

    const items = await getDocs(collection(a.db, `businesses/${a.businessId}/items`));
    expect(items.docs.map((d) => d.data().name).sort()).toEqual(["Binding wire", "Cement", "Cotton"]);

    // Numbers never repeat, even after a delete.
    await httpsCallable(a.fns, "deleteOrder")({ orderId: second.data.id });
    expect((await save(newOrder(vendorId))).data.number).toBe(3);
  });

  it("saveOrder rejects bad input with a readable message", async () => {
    const save = httpsCallable(a.fns, "saveOrder");
    const bad = (over: Record<string, unknown>) => save(newOrder(vendorId, over));
    await expect(bad({ items: [] })).rejects.toThrow("Add at least one item.");
    await expect(bad({ items: [{ name: "X", qty: 0, rate: 1 }] }))
      .rejects.toThrow("Item 1 quantity must be more than 0.");
    await expect(bad({ items: [{ name: "", qty: 1, rate: 1 }] }))
      .rejects.toThrow("Enter item 1 name.");
    await expect(bad({ orderDate: "2026-13-45" })).rejects.toMatchObject({ code: "functions/invalid-argument" });
    await expect(bad({ vendorId: "nope" })).rejects.toMatchObject({ code: "functions/not-found" });
    // Another business can't use A's vendor.
    await expect(httpsCallable(b.fns, "saveOrder")(newOrder(vendorId)))
      .rejects.toMatchObject({ code: "functions/not-found" });
  });

  it("editing an order logs each change; deleting it moves its payments to the account", async () => {
    const save = httpsCallable<Record<string, unknown>, { id: string; number: number }>(a.fns, "saveOrder");
    const { data } = await save(newOrder(vendorId));
    await save(newOrder(vendorId, {
      orderId: data.id, status: "received", invoiceAmount: 2600, invoiceNo: "B-1",
      items: [{ name: "Cotton", qty: 208, rate: 12.5 }],
    }));
    const log = await getDocs(collection(a.db, `businesses/${a.businessId}/auditLog`));
    const fields = log.docs.filter((d) => d.data().entityId === data.id).map((d) => d.data().field).sort();
    expect(fields).toEqual(["amount", "invoiceAmount", "invoiceNo", "items", "status"]);

    const payments = collection(a.db, `businesses/${a.businessId}/payments`);
    const pay = await addDoc(payments, {
      orderId: data.id, vendorId, vendorName: "Karachi Cotton", amount: 1000, method: "cash",
      date: "2026-09-02", bankAccount: null, bankRef: null, chequeNo: null, chequeBank: null,
      chequeDate: null, clearedStatus: null, clearedDate: null, cashTo: null, createdAt: serverTimestamp(),
    });
    await httpsCallable(a.fns, "deleteOrder")({ orderId: data.id });
    expect((await getDoc(pay)).data()).toMatchObject({ orderId: null, amount: 1000 });
    expect((await getDoc(doc(a.db, `businesses/${a.businessId}/orders/${data.id}`))).exists()).toBe(false);

    await expect(httpsCallable(b.fns, "deleteOrder")({ orderId: data.id }))
      .rejects.toMatchObject({ code: "functions/not-found" });
  });

  it("owner B, with a real token, cannot read or write owner A's data", async () => {
    await denied(getDoc(doc(b.db, `businesses/${a.businessId}`)));
    await denied(getDocs(collection(b.db, `businesses/${a.businessId}/vendors`)));
    await denied(getDocs(collection(b.db, `businesses/${a.businessId}/orders`)));
    await denied(getDocs(collection(b.db, `businesses/${a.businessId}/payments`)));
    await denied(addDoc(collection(b.db, `businesses/${a.businessId}/vendors`), {
      name: "x", phone: "", notes: "", createdAt: serverTimestamp(),
    }));
    // B's own tenant is empty.
    const own = await getDocs(collection(b.db, `businesses/${b.businessId}/vendors`));
    expect(own.size).toBe(0);
  });

  it("vendor links: only the owning tenant can create one; anyone with the token can read that vendor only", async () => {
    await expect(
      httpsCallable(b.fns, "createVendorLink")({ vendorId }),
    ).rejects.toMatchObject({ code: "functions/not-found" });

    const { data } = await httpsCallable<{ vendorId: string }, { token: string }>(a.fns, "createVendorLink")({ vendorId });
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const again = await httpsCallable<{ vendorId: string }, { token: string }>(a.fns, "createVendorLink")({ vendorId });
    expect(again.data.token).toBe(data.token);

    const anon = client("anon");
    const res = await httpsCallable<{ token: string }, Record<string, unknown>>(anon.fns, "resolveVendorLink")({ token: data.token });
    expect(res.data).toMatchObject({ businessName: "A Traders", vendorName: "Karachi Cotton" });
    expect((res.data.orders as { number: number }[]).map((o) => o.number).sort()).toEqual([1, 3]);
    expect(JSON.stringify(res.data)).not.toContain("internal note");

    await expect(
      httpsCallable(anon.fns, "resolveVendorLink")({ token: "x".repeat(32) }),
    ).rejects.toMatchObject({ code: "functions/not-found" });

    await httpsCallable(a.fns, "revokeVendorLink")({ vendorId });
    await expect(
      httpsCallable(anon.fns, "resolveVendorLink")({ token: data.token }),
    ).rejects.toMatchObject({ code: "functions/not-found" });
  });
});

export type { Firestore, Functions };
